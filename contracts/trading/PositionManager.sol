// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

import '../libraries/Position.sol';
import '../libraries/PositionKey.sol';
import '../interfaces/IPositionManager.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import '../libraries/Roleable.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

contract PositionManager is IPositionManager, ReentrancyGuard, Roleable, Pausable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    mapping(bytes32 => Position.Info) public positions;

    mapping(address => bool) public override isFrozen;

    mapping(uint256 => int256) public override netExposureAmountChecker;
    mapping(uint256 => uint256) public override longTracker;
    mapping(uint256 => uint256) public override shortTracker;

    // cumulativeFundingRates tracks the funding rates based on utilization
    mapping(uint256 => int256) public cumulativeFundingRates;
    mapping(uint256 => int256) public lastFundingRates;
    // lastFundingTimes tracks the last time funding was updated for a token
    mapping(uint256 => uint256) public lastFundingTimes;

    uint256 public fundingInterval;

    IPool public pool;
    address public tradingFeeReceiver;
    address public addressExecutor;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pairInfo,
        address _tradingFeeReceiver,
        uint256 _fundingInterval
    ) Roleable(addressProvider) {
        pool = _pairInfo;
        tradingFeeReceiver = _tradingFeeReceiver;
        fundingInterval = _fundingInterval;
    }

    modifier onlyExecutor() {
        require(msg.sender == addressExecutor, 'Position Manager: forbidden');
        _;
    }

    function setExecutor(address _addressExecutor) external onlyPoolAdmin {
        addressExecutor = _addressExecutor;
    }

    function updateTradingFeeReceiver(address newReceiver) external onlyPoolAdmin {
        address oldReceiver = tradingFeeReceiver;
        tradingFeeReceiver = newReceiver;
        emit UpdateTradingFeeReceiver(oldReceiver, newReceiver);
    }

    function updateFundingInterval(uint256 newInterval) external onlyPoolAdmin {
        uint256 oldInterval = fundingInterval;
        fundingInterval = newInterval;
        emit UpdateFundingInterval(oldInterval, newInterval);
    }

    function increasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong,
        uint256 _price
    ) external nonReentrant onlyExecutor whenNotPaused returns (uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        require(pair.enable, 'trade pair not supported');

        // get position
        bytes32 positionKey = PositionKey.getPositionKey(_account, _pairIndex, _isLong);
        Position.Info storage position = positions[positionKey];
        position.key = positionKey;

        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        // 修改仓位
        if (position.positionAmount == 0) {
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = _price;
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) + sizeDelta).mulDiv(
                PrecisionUtils.pricePrecision(),
                (position.positionAmount + _sizeAmount)
            );
        }

        position.positionAmount = position.positionAmount + _sizeAmount;

        int256 afterCollateral = int256(position.collateral);
        uint256 transferOut;

        // funding fee
        updateCumulativeFundingRate(_pairIndex, _price);
        fundingFee = getFundingFee(true, _account, _pairIndex, _isLong, _sizeAmount);

        if (fundingFee >= 0) {
            if (_isLong) {
                afterCollateral -= fundingFee;
            } else {
                (uint256 userAmount, ) = _distributeFundingFee(_pairIndex, fundingFee.abs());
                transferOut += userAmount;
            }
        } else {
            if (!_isLong) {
                afterCollateral += fundingFee;
            } else {
                (uint256 userAmount, ) = _distributeFundingFee(_pairIndex, fundingFee.abs());
                transferOut += userAmount;
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = _tradingFee(_pairIndex, _isLong, _sizeAmount, _price);
        afterCollateral -= int256(tradingFee);

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);

        // final collateral & out
        afterCollateral += _collateral;
        transferOut += _collateral < 0 ? _collateral.abs() : 0;
        require(afterCollateral > 0, 'collateral not enough');

        position.collateral = afterCollateral.abs();

        // update lp vault
        if (_sizeAmount > 0) {
            int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
            netExposureAmountChecker[_pairIndex] =
                prevNetExposureAmountChecker +
                (_isLong ? int256(_sizeAmount) : -int256(_sizeAmount));
            if (_isLong) {
                longTracker[_pairIndex] += _sizeAmount;
            } else {
                shortTracker[_pairIndex] += _sizeAmount;
            }

            IPool.Vault memory lpVault = pool.getVault(_pairIndex);

            if (prevNetExposureAmountChecker > 0) {
                if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                    pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);

                    uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                        sizeDelta).calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);

                    pool.updateAveragePrice(_pairIndex, averagePrice);
                } else {
                    uint256 decreaseLong;
                    uint256 increaseShort;

                    if (netExposureAmountChecker[_pairIndex] >= 0) {
                        decreaseLong = _sizeAmount;
                    } else {
                        decreaseLong = uint256(prevNetExposureAmountChecker);
                        increaseShort = _sizeAmount - decreaseLong;
                    }

                    // decrease reserve & pnl

                    pool.decreaseReserveAmount(_pairIndex, decreaseLong, 0);
                    if (_price > lpVault.averagePrice) {
                        uint256 profit = decreaseLong.mulPrice(_price - lpVault.averagePrice);

                        pool.decreaseProfit(_pairIndex, profit);
                    } else {
                        uint256 profit = decreaseLong.mulPrice(lpVault.averagePrice - _price);

                        IERC20(pair.stableToken).safeTransfer(address(pool), profit);
                        pool.increaseProfit(_pairIndex, profit);
                    }

                    // increase reserve
                    if (increaseShort > 0) {
                        pool.increaseReserveAmount(_pairIndex, 0, increaseShort.mulPrice(_price));

                        pool.updateAveragePrice(_pairIndex, _price);
                    }

                    // zero exposure
                    if (netExposureAmountChecker[_pairIndex] == 0) {
                        pool.updateAveragePrice(_pairIndex, 0);
                    }
                }
            } else if (prevNetExposureAmountChecker < 0) {
                if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                    pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                    uint256 averagePrice = (uint256(-prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                        sizeDelta).calculatePrice(uint256(-prevNetExposureAmountChecker) + _sizeAmount);
                    pool.updateAveragePrice(_pairIndex, averagePrice);
                } else {
                    uint256 decreaseShort;
                    uint256 increaseLong;

                    if (netExposureAmountChecker[_pairIndex] <= 0) {
                        decreaseShort = _sizeAmount;
                    } else {
                        decreaseShort = uint256(-prevNetExposureAmountChecker);
                        increaseLong = _sizeAmount - decreaseShort;
                    }

                    // decrease reserve & pnl
                    pool.decreaseReserveAmount(
                        _pairIndex,
                        0,
                        netExposureAmountChecker[_pairIndex] >= 0
                            ? lpVault.stableReservedAmount
                            : decreaseShort.mulPrice(lpVault.averagePrice)
                    );
                    if (_price > lpVault.averagePrice) {
                        uint256 profit = decreaseShort.mulPrice(_price - lpVault.averagePrice);
                        IERC20(pair.stableToken).safeTransfer(address(pool), profit);
                        pool.increaseProfit(_pairIndex, profit);
                    } else {
                        uint256 profit = decreaseShort.mulPrice(lpVault.averagePrice - _price);
                        pool.decreaseProfit(_pairIndex, profit);
                    }

                    // increase reserve
                    if (increaseLong > 0) {
                        pool.increaseReserveAmount(_pairIndex, increaseLong, 0);
                        pool.updateAveragePrice(_pairIndex, _price);
                    }

                    // zero exposure
                    if (netExposureAmountChecker[_pairIndex] == 0) {
                        pool.updateAveragePrice(_pairIndex, 0);
                    }
                }
            } else {
                if (netExposureAmountChecker[_pairIndex] > 0) {
                    pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                } else {
                    pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                }
                pool.updateAveragePrice(_pairIndex, _price);
            }
        }

        if (transferOut > 0) {
            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }

        emit IncreasePosition(
            positionKey,
            _account,
            _pairIndex,
            _collateral,
            _isLong,
            _sizeAmount,
            _price,
            tradingFee,
            fundingFee,
            transferOut
        );

        emit UpdatePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            position.collateral,
            position.positionAmount,
            position.averagePrice,
            position.entryFundingRate,
            position.entryFundingTime,
            position.realisedPnl,
            _price
        );
    }

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong,
        uint256 _price
    ) external onlyExecutor nonReentrant whenNotPaused returns (uint256 tradingFee, int256 fundingFee, int256 pnl) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);

        // check trading amount
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(_pairIndex);
        require(
            _sizeAmount >= tradingConfig.minTradeAmount && _sizeAmount <= tradingConfig.maxTradeAmount,
            'invalid size'
        );

        // get position
        bytes32 positionKey = PositionKey.getPositionKey(_account, _pairIndex, _isLong);
        Position.Info storage position = positions[positionKey];
        require(position.account != address(0), 'position already closed');

        // update position size
        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        position.positionAmount -= _sizeAmount;

        int256 afterCollateral = int256(position.collateral);
        uint256 transferOut;

        // funding fee
        updateCumulativeFundingRate(_pairIndex, _price);
        fundingFee = getFundingFee(false, _account, _pairIndex, _isLong, _sizeAmount);

        if (fundingFee >= 0) {
            if (_isLong) {
                afterCollateral -= fundingFee;
            } else {
                (uint256 userAmount, ) = _distributeFundingFee(_pairIndex, fundingFee.abs());
                transferOut += userAmount;
            }
        } else {
            if (!_isLong) {
                afterCollateral -= (-fundingFee);
            } else {
                (uint256 userAmount, ) = _distributeFundingFee(_pairIndex, fundingFee.abs());
                transferOut += userAmount;
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = _tradingFee(_pairIndex, !_isLong, _sizeAmount, _price);
        afterCollateral -= int256(tradingFee);

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);

        // update lp vault
        if (_sizeAmount > 0) {
            int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
            netExposureAmountChecker[_pairIndex] =
                prevNetExposureAmountChecker +
                (_isLong ? -int256(_sizeAmount) : int256(_sizeAmount));
            if (_isLong) {
                longTracker[_pairIndex] -= _sizeAmount;
            } else {
                shortTracker[_pairIndex] -= _sizeAmount;
            }

            IPool.Vault memory lpVault = pool.getVault(_pairIndex);
            if (prevNetExposureAmountChecker > 0) {
                if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                    pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);

                    uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                        sizeDelta).calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);
                    pool.updateAveragePrice(_pairIndex, averagePrice);
                } else {
                    uint256 decreaseLong;
                    uint256 increaseShort;

                    if (netExposureAmountChecker[_pairIndex] >= 0) {
                        decreaseLong = _sizeAmount;
                    } else {
                        decreaseLong = uint256(prevNetExposureAmountChecker);
                        increaseShort = _sizeAmount - decreaseLong;
                    }

                    // decrease reserve & pnl
                    pool.decreaseReserveAmount(_pairIndex, decreaseLong, 0);
                    if (_price > lpVault.averagePrice) {
                        uint256 profit = decreaseLong.mulPrice(_price - lpVault.averagePrice);
                        pool.decreaseProfit(_pairIndex, profit);
                    } else {
                        uint256 profit = decreaseLong.mulPrice(lpVault.averagePrice - _price);
                        IERC20(pair.stableToken).safeTransfer(address(pool), profit);
                        pool.increaseProfit(_pairIndex, profit);
                    }

                    // increase reserve
                    if (increaseShort > 0) {
                        pool.increaseReserveAmount(_pairIndex, 0, increaseShort.mulPrice(_price));
                        pool.updateAveragePrice(_pairIndex, _price);
                    }

                    // zero exposure
                    if (netExposureAmountChecker[_pairIndex] == 0) {
                        pool.updateAveragePrice(_pairIndex, 0);
                    }
                }
            } else if (prevNetExposureAmountChecker < 0) {
                if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                    pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                    uint256 averagePrice = (uint256(-prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                        sizeDelta).calculatePrice(uint256(-prevNetExposureAmountChecker) + _sizeAmount);
                    pool.updateAveragePrice(_pairIndex, averagePrice);
                } else {
                    uint256 decreaseShort;
                    uint256 increaseLong;

                    if (netExposureAmountChecker[_pairIndex] <= 0) {
                        decreaseShort = _sizeAmount;
                    } else {
                        decreaseShort = uint256(-prevNetExposureAmountChecker);
                        increaseLong = _sizeAmount - decreaseShort;
                    }

                    // decrease reserve & pnl

                    pool.decreaseReserveAmount(
                        _pairIndex,
                        0,
                        netExposureAmountChecker[_pairIndex] >= 0
                            ? lpVault.stableReservedAmount
                            : decreaseShort.mulPrice(lpVault.averagePrice)
                    );
                    if (_price > lpVault.averagePrice) {
                        uint256 profit = decreaseShort.mulPrice(_price - lpVault.averagePrice);

                        IERC20(pair.stableToken).safeTransfer(address(pool), profit);
                        pool.increaseProfit(_pairIndex, profit);
                    } else {
                        uint256 profit = decreaseShort.mulPrice(lpVault.averagePrice - _price);

                        pool.decreaseProfit(_pairIndex, profit);
                    }

                    // increase reserve
                    if (increaseLong > 0) {
                        pool.increaseReserveAmount(_pairIndex, increaseLong, 0);

                        pool.updateAveragePrice(_pairIndex, _price);
                    }

                    // zero exposure
                    if (netExposureAmountChecker[_pairIndex] == 0) {
                        pool.updateAveragePrice(_pairIndex, 0);
                    }
                }
            } else {
                if (netExposureAmountChecker[_pairIndex] > 0) {
                    pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                } else {
                    pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                }
                pool.updateAveragePrice(_pairIndex, _price);
            }
        }

        // pnl
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(pair.indexToken);
        pnl = position.getUnrealizedPnl(_sizeAmount, price);

        if (pnl > 0) {
            transferOut += pnl.abs();
        } else {
            afterCollateral += pnl;
        }
        position.realisedPnl += pnl;

        // final collateral & out
        if (position.positionAmount == 0) {
            // transfer out all collateral and _collateral
            int256 allTransferOut = int256(transferOut) + afterCollateral + (_collateral > 0 ? _collateral : int256(0));
            transferOut = allTransferOut > 0 ? allTransferOut.abs() : 0;
            delete positions[positionKey];
            emit ClosePosition(positionKey, _account, _pairIndex, _isLong);
        } else {
            afterCollateral += _collateral;
            transferOut += (_collateral < 0 ? uint256(-_collateral) : 0);
            require(afterCollateral > 0, 'collateral not enough');
            position.collateral = afterCollateral.abs();
        }

        if (transferOut > 0) {
            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }

        emit DecreasePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            _collateral,
            _sizeAmount,
            _price,
            tradingFee,
            fundingFee,
            pnl,
            transferOut
        );

        emit UpdatePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            position.collateral,
            position.positionAmount,
            position.averagePrice,
            position.entryFundingRate,
            position.entryFundingTime,
            position.realisedPnl,
            _price
        );
    }

    function updateCumulativeFundingRate(uint256 _pairIndex, uint256 _price) public whenNotPaused {
        if (lastFundingTimes[_pairIndex] == 0) {
            lastFundingTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
            return;
        }

        if (block.timestamp - lastFundingTimes[_pairIndex] < fundingInterval) {
            return;
        }

        uint256 intervals = (block.timestamp - lastFundingTimes[_pairIndex]) / fundingInterval;
        int256 nextFundingRate = _currentFundingRate(_pairIndex, _price);

        lastFundingRates[_pairIndex] = nextFundingRate;
        cumulativeFundingRates[_pairIndex] = cumulativeFundingRates[_pairIndex] + nextFundingRate * int256(intervals);
        lastFundingTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;

        emit UpdateFundingRate(_pairIndex, cumulativeFundingRates[_pairIndex], lastFundingTimes[_pairIndex]);
    }

    function getTradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) external view override returns (uint256 tradingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(pair.indexToken);
        return _tradingFee(_pairIndex, _isLong, _sizeAmount, price);
    }

    function _tradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount,
        uint256 _price
    ) internal view returns (uint256 tradingFee) {
        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(_pairIndex);
        if (netExposureAmountChecker[_pairIndex] >= 0) {
            if (_isLong) {
                // fee
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP);
            }
        } else {
            if (_isLong) {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP);
            }
        }
        return tradingFee;
    }

    //TODO will remove
    function transferTokenTo(address token, address to, uint256 amount) external onlyExecutor {
        IERC20(token).safeTransfer(to, amount);
    }

    function getFundingFee(
        bool _increase,
        address _account,
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) public view override returns (int256) {
        Position.Info memory position = positions.get(_account, _pairIndex, _isLong);

        uint256 interval = block.timestamp - position.entryFundingTime;
        if (interval < fundingInterval) {
//            if (!_increase) {
//                int256 fundingRate = (lastFundingRates[_pairIndex] * int256(interval)) / int256(fundingInterval);
//                return (int256(_sizeAmount) * fundingRate) / int256(PrecisionUtils.fundingRatePrecision());
//            }
            return 0;
        }

        int256 fundingRate = cumulativeFundingRates[_pairIndex] - position.entryFundingRate;
        return (int256(position.positionAmount) * fundingRate) / int256(PrecisionUtils.fundingRatePrecision());
    }

    function getCurrentFundingRate(uint256 _pairIndex) external view override returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(pair.indexToken);
        return _currentFundingRate(_pairIndex, price);
    }

    function _currentFundingRate(uint256 _pairIndex, uint256 _price) internal view returns (int256 fundingRate) {
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);

        uint256 absNetExposure = netExposureAmountChecker[_pairIndex].abs();
        uint256 w = fundingFeeConfig.fundingWeightFactor;
        uint256 q = longTracker[_pairIndex] + shortTracker[_pairIndex];
        uint256 k = fundingFeeConfig.liquidityPremiumFactor;

        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        uint256 l = (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(_price) +
            (lpVault.stableTotalAmount - lpVault.stableReservedAmount);

        uint256 absFundingRate;
        if (q == 0 || l == 0) {
            fundingRate = fundingFeeConfig.defaultFundingRate;
        } else {
            absFundingRate =
                (w * absNetExposure * PrecisionUtils.fundingRatePrecision()) /
                (k * q) +
                ((PrecisionUtils.fundingRatePrecision() - w) * absNetExposure) /
                (k * l);
            fundingRate = netExposureAmountChecker[_pairIndex] >= 0 ? int256(absFundingRate) : -int256(absFundingRate);
        }

        fundingRate = (fundingRate - fundingFeeConfig.interest).max(fundingFeeConfig.minFundingRate).min(
            fundingFeeConfig.maxFundingRate
        );
    }

    function _distributeFundingFee(
        uint256 _pairIndex,
        uint256 _fundingFee
    ) internal returns (uint256 userAmount, uint256 lpAmount) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);

        lpAmount = _fundingFee.mulPercentage(fundingFeeConfig.lpDistributeP);
        userAmount = _fundingFee - lpAmount;

        IERC20(pair.stableToken).safeTransfer(address(pool), lpAmount);
        pool.increaseTotalAmount(_pairIndex, 0, lpAmount);

        return (userAmount, lpAmount);
    }

    function getValidPrice(address token, uint256 _pairIndex, bool _isLong) public view returns (uint256) {
        IOraclePriceFeed oraclePriceFeed = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle());

        // IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 oraclePrice = oraclePriceFeed.getPrice(token);

        uint256 indexPrice = oraclePriceFeed.getIndexPrice(token, 0);

        uint256 diffP = oraclePrice > indexPrice ? oraclePrice - indexPrice : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(_pairIndex);
        require(diffP <= tradingConfig.maxPriceDeviationP, 'exceed max price deviation');
        return oraclePrice;
    }

    function getPosition(
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) public view returns (Position.Info memory) {
        Position.Info memory position = positions.get(_account, _pairIndex, _isLong);
        return position;
    }

    function getPositionByKey(bytes32 key) public view returns (Position.Info memory) {
        Position.Info memory position = positions[key];
        return position;
    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return PositionKey.getPositionKey(_account, _pairIndex, _isLong);
    }

    function setPaused() external onlyAdmin {
        _pause();
    }

    function setUnPaused() external onlyAdmin {
        _unpause();
    }
}
