// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import '../libraries/Position.sol';
import '../libraries/PositionKey.sol';
import {PositionStatus, IPositionManager} from '../interfaces/IPositionManager.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import '../libraries/Roleable.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import './FeeManager.sol';

contract PositionManager is FeeManager, IPositionManager, Pausable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using SafeMath for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    mapping(bytes32 => Position.Info) public positions;

    // mapping(uint256 => int256) public override getExposedPositions;
    mapping(uint256 => uint256) public override longTracker;
    mapping(uint256 => uint256) public override shortTracker;

    // gobleFundingRateIndex tracks the funding rates based on utilization
    mapping(uint256 => int256) public gobleFundingRateIndex;

    // lastFundingRateUpdateTimes tracks the last time funding was updated for a token
    mapping(uint256 => uint256) public lastFundingRateUpdateTimes;

    uint256 public fundingInterval;

    address public addressExecutor;
    address public addressOrderManager;

    constructor(
        IAddressesProvider addressProvider,
        IPool pool,
        IFeeCollector feeCollector,
        uint256 _fundingInterval
    ) FeeManager(addressProvider, pool, feeCollector) {
        fundingInterval = _fundingInterval;
    }

    modifier onlyExecutor() {
        require(msg.sender == addressExecutor, 'Position Manager: forbidden');
        _;
    }

    function setExecutor(address _addressExecutor) external onlyPoolAdmin {
        addressExecutor = _addressExecutor;
    }

    function setOrderManager(address _addressOrderManager) external onlyPoolAdmin {
        addressOrderManager = _addressOrderManager;
    }

    function updateFundingInterval(uint256 newInterval) external onlyPoolAdmin {
        uint256 oldInterval = fundingInterval;
        fundingInterval = newInterval;
        emit UpdateFundingInterval(oldInterval, newInterval);
    }

    function _takeFundingFeeAddTraderFee(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        int256 _collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 _price
    ) internal returns (int256 afterCollateral, uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        afterCollateral = _collateral;

        tradingFee = _tradingFee(_pairIndex, _isLong, _sizeAmount, _price);
        afterCollateral -= int256(tradingFee);

        _updateFee(pair, _account, _keeper, tradingFee, vipRate, referenceRate);

        fundingFee = getFundingFee(true, _account, _pairIndex, _isLong, _sizeAmount);
        if (fundingFee >= 0) {
            if (_isLong) {
                afterCollateral -= fundingFee;
            } else {
                afterCollateral += fundingFee;
            }
        } else {
            if (!_isLong) {
                afterCollateral += fundingFee;
            } else {
                afterCollateral -= fundingFee;
            }
        }
    }

    function getExposedPositions(uint256 _pairIndex) public view override returns (int256) {
        if (longTracker[_pairIndex] > shortTracker[_pairIndex]) {
            return int256(longTracker[_pairIndex] - shortTracker[_pairIndex]);
        } else {
            return -int256(shortTracker[_pairIndex] - longTracker[_pairIndex]);
        }
    }

    function _settleLPPosition(
        uint256 _pairIndex,
        uint256 _sizeAmount,
        bool _isLong,
        bool isIncrease,
        uint256 _price
    ) internal {
        if (_sizeAmount == 0) {
            return;
        }
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex);
        if (isIncrease) {
            if (_isLong) {
                longTracker[_pairIndex] += _sizeAmount;
            } else {
                shortTracker[_pairIndex] += _sizeAmount;
            }
        } else {
            if (_isLong) {
                longTracker[_pairIndex] -= _sizeAmount;
            } else {
                shortTracker[_pairIndex] -= _sizeAmount;
            }
        }
        int256 nextExposureAmountChecker = getExposedPositions(_pairIndex);
        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        PositionStatus currentPositionStatus = PositionStatus.Balance;
        if (currentExposureAmountChecker > 0) {
            currentPositionStatus = PositionStatus.NetLong;
        } else {
            currentPositionStatus = PositionStatus.NetShort;
        }
        PositionStatus nextPositionStatus = PositionStatus.Balance;
        if (nextExposureAmountChecker > 0) {
            nextPositionStatus = PositionStatus.NetLong;
        } else {
            nextPositionStatus = PositionStatus.NetShort;
        }
        bool isAddPosition = nextExposureAmountChecker > currentExposureAmountChecker;

        IPool.Vault memory lpVault = pool.getVault(_pairIndex);

        if (currentPositionStatus == PositionStatus.Balance) {
            if (nextExposureAmountChecker > 0) {
                pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pool.updateAveragePrice(_pairIndex, _price);
            return;
        }

        if (currentPositionStatus == PositionStatus.NetLong) {
            if (isAddPosition) {
                pool.increaseReserveAmount(_pairIndex, _sizeAmount, 0);

                uint256 averagePrice = (uint256(currentExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(currentExposureAmountChecker) + _sizeAmount);

                pool.updateAveragePrice(_pairIndex, averagePrice);
            } else {
                uint256 decreaseLong;
                uint256 increaseShort;

                if (nextPositionStatus != PositionStatus.NetShort) {
                    decreaseLong = _sizeAmount;
                } else {
                    decreaseLong = uint256(currentExposureAmountChecker);
                    increaseShort = _sizeAmount - decreaseLong;
                }

                pool.decreaseReserveAmount(_pairIndex, decreaseLong, 0);
                _calLpProfit(_pairIndex, _price, true, decreaseLong);

                // increase reserve
                if (increaseShort > 0) {
                    pool.increaseReserveAmount(_pairIndex, 0, increaseShort.mulPrice(_price));
                    pool.updateAveragePrice(_pairIndex, _price);
                }
            }
        } else {
            if (isAddPosition) {
                uint256 decreaseShort;
                uint256 increaseLong;

                if (nextExposureAmountChecker <= 0) {
                    decreaseShort = _sizeAmount;
                } else {
                    decreaseShort = uint256(-currentExposureAmountChecker);
                    increaseLong = _sizeAmount - decreaseShort;
                }

                // decrease reserve & pnl
                pool.decreaseReserveAmount(
                    _pairIndex,
                    0,
                    nextExposureAmountChecker >= 0
                        ? lpVault.stableReservedAmount
                        : decreaseShort.mulPrice(lpVault.averagePrice)
                );
                _calLpProfit(_pairIndex, _price, false, decreaseShort);
                // increase reserve
                if (increaseLong > 0) {
                    pool.increaseReserveAmount(_pairIndex, increaseLong, 0);
                    pool.updateAveragePrice(_pairIndex, _price);
                }
            } else {
                pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                uint256 averagePrice = (uint256(-currentExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(-currentExposureAmountChecker) + _sizeAmount);
                pool.updateAveragePrice(_pairIndex, averagePrice);
            }
        }
        // zero exposure
        if (nextPositionStatus == PositionStatus.Balance) {
            pool.updateAveragePrice(_pairIndex, 0);
        }
    }

    function _calLpProfit(uint256 _pairIndex, uint256 _price, bool positive, uint amount) internal {
        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        if (positive) {
            if (_price > lpVault.averagePrice) {
                uint256 profit = amount.mulPrice(_price - lpVault.averagePrice);
                pool.decreaseLPProfit(_pairIndex, profit);
            } else {
                uint256 profit = amount.mulPrice(lpVault.averagePrice - _price);
                pool.increaseLPProfit(_pairIndex, profit);
            }
        } else {
            if (_price < lpVault.averagePrice) {
                uint256 profit = amount.mulPrice(lpVault.averagePrice - _price);

                pool.decreaseLPProfit(_pairIndex, profit);
            } else {
                uint256 profit = amount.mulPrice(_price - lpVault.averagePrice);
                pool.increaseLPProfit(_pairIndex, profit);
            }
        }
    }

    //todo why not oracle price
    function increasePosition(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        int256 _collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 _price
    ) external nonReentrant onlyExecutor whenNotPaused returns (uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        require(pair.enable, 'trade pair not supported');

        // get position
        bytes32 positionKey = PositionKey.getPositionKey(_account, _pairIndex, _isLong);
        Position.Info storage position = positions[positionKey];
        // position.key = positionKey;

        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

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

        // funding fee
        updateFundingRate(_pairIndex, _price);

        position.fundRateIndex = gobleFundingRateIndex[_pairIndex];
        int256 afterCollateral;
        (afterCollateral, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            _pairIndex,
            _account,
            _keeper,
            _sizeAmount,
            _isLong,
            int256(position.collateral),
            vipRate,
            referenceRate,
            _price
        );

        // trading fee

        uint256 transferOut;
        // final collateral & out
        afterCollateral += _collateral;
        transferOut += _collateral < 0 ? _collateral.abs() : 0;
        require(afterCollateral > 0, 'collateral not enough');

        position.collateral = afterCollateral.abs();

        // update lp vault
        _settleLPPosition(_pairIndex, _sizeAmount, _isLong, true, _price);
        if (transferOut > 0) {
            pool.transferTokenTo(pair.stableToken, _account, transferOut);
            //            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }
        //todo emit pnl
        int256 pnl;

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
            position.fundRateIndex,
            pnl,
            _price
        );
    }

    function decreasePosition(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        int256 _collateral,
        uint256 vipRate,
        uint256 referenceRate,
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

        uint256 transferOut;

        // funding fee
        updateFundingRate(_pairIndex, _price);
        int256 afterCollateral;
        (afterCollateral, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            _pairIndex,
            _account,
            _keeper,
            _sizeAmount,
            _isLong,
            int256(position.collateral),
            vipRate,
            referenceRate,
            _price
        );

        position.fundRateIndex = gobleFundingRateIndex[_pairIndex];
        // position.entryFundingTime = lastFundingRateUpdateTimes[_pairIndex];

        // update lp vault
        _settleLPPosition(_pairIndex, _sizeAmount, _isLong, false, _price);

        // pnl
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(pair.indexToken);
        pnl = position.getUnrealizedPnl(_sizeAmount, price);

        if (pnl > 0) {
            transferOut += pnl.abs();
        } else {
            afterCollateral += pnl;
        }

        // final collateral & out
        if (position.positionAmount == 0) {
            // transfer out all collateral and _collateral
            int256 allTransferOut = int256(transferOut) + afterCollateral + (_collateral > 0 ? _collateral : int256(0));
            transferOut = allTransferOut > 0 ? allTransferOut.abs() : 0;

            emit ClosePosition(positionKey, _account, _pairIndex, _isLong);

            emit DecreasePosition(
                positionKey,
                _account,
                _pairIndex,
                _isLong,
                -int256(position.collateral),
                _sizeAmount,
                _price,
                tradingFee,
                fundingFee,
                // pnl,
                transferOut
            );
            delete positions[positionKey];
        } else {
            afterCollateral += _collateral;
            transferOut += (_collateral < 0 ? uint256(-_collateral) : 0);
            require(afterCollateral > 0, 'collateral not enough');
            position.collateral = afterCollateral.abs();

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
                // pnl,
                transferOut
            );
        }

        if (transferOut > 0) {
            //            //TODO fix: Insufficient vault balance
            //            require(
            //                IERC20(pair.stableToken).balanceOf(address(this)) > transferOut,
            //                'todo: to be fixed, Insufficient vault balance'
            //            );
            //            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
            //
            pool.transferTokenTo(pair.stableToken, _account, transferOut);
        }

        emit UpdatePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            position.collateral,
            position.positionAmount,
            position.averagePrice,
            position.fundRateIndex,
            // position.entryFundingTime,
            pnl,
            _price
        );
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
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex);
        if (currentExposureAmountChecker >= 0) {
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

    // TODO receiver? ?onlyPoolAdmin

    function getFundingFee(
        bool _increase,
        address _account,
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) public view override returns (int256) {
        Position.Info memory position = positions.get(_account, _pairIndex, _isLong);
        //todo  Position is converted to margin currency
        int256 fundingRate = gobleFundingRateIndex[_pairIndex] - position.fundRateIndex;
        return (int256(position.positionAmount) * fundingRate) / int256(PrecisionUtils.fundingRatePrecision());
    }

    function updateFundingRate(uint256 _pairIndex, uint256 _price) public whenNotPaused {
        if (lastFundingRateUpdateTimes[_pairIndex] == 0) {
            lastFundingRateUpdateTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
            return;
        }
        if (block.timestamp - lastFundingRateUpdateTimes[_pairIndex] < fundingInterval) {
            return;
        }
        int256 nextFundingRate = _currentFundingRate(_pairIndex, _price);
        gobleFundingRateIndex[_pairIndex] = gobleFundingRateIndex[_pairIndex] + nextFundingRate;
        lastFundingRateUpdateTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
        //todo  fund rate for settlement lp

        uint256 lpPosition;

        if (longTracker[_pairIndex] > shortTracker[_pairIndex]) {
            lpPosition = longTracker[_pairIndex] - shortTracker[_pairIndex];
            nextFundingRate > 0
                ? pool.increaseLPProfit(
                    _pairIndex,
                    lpPosition.mul(nextFundingRate.abs()).div(PrecisionUtils.fundingRatePrecision())
                )
                : pool.decreaseLPProfit(
                    _pairIndex,
                    lpPosition.mul(nextFundingRate.abs()).div(PrecisionUtils.fundingRatePrecision())
                );
        } else {
            lpPosition = shortTracker[_pairIndex] - longTracker[_pairIndex];
            nextFundingRate > 0
                ? pool.decreaseLPProfit(
                    _pairIndex,
                    lpPosition.mul(nextFundingRate.abs()).div(PrecisionUtils.fundingRatePrecision())
                )
                : pool.increaseLPProfit(
                    _pairIndex,
                    lpPosition.mul(nextFundingRate.abs()).div(PrecisionUtils.fundingRatePrecision())
                );
        }

        emit UpdateFundingRate(_pairIndex, gobleFundingRateIndex[_pairIndex], lastFundingRateUpdateTimes[_pairIndex]);
    }

    function getCurrentFundingRate(uint256 _pairIndex) external view override returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(pair.indexToken);
        return _currentFundingRate(_pairIndex, price);
    }

    function _currentFundingRate(uint256 _pairIndex, uint256 _price) internal view returns (int256 fundingRate) {
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex);
        uint256 absNetExposure = currentExposureAmountChecker.abs();
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
            fundingRate = currentExposureAmountChecker >= 0 ? int256(absFundingRate) : -int256(absFundingRate);
        }

        fundingRate = (fundingRate - fundingFeeConfig.interest).max(fundingFeeConfig.minFundingRate).min(
            fundingFeeConfig.maxFundingRate
        );
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
