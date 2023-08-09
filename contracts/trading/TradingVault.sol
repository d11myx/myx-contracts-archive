// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

import '../libraries/Position.sol';
import '../libraries/PositionKey.sol';
import '../interfaces/ITradingVault.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import '../libraries/Roleable.sol';
import '../pair/interfaces/IPairInfo.sol';
import '../pair/interfaces/IPairVault.sol';
import 'hardhat/console.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

contract TradingVault is ITradingVault, ReentrancyGuard, Roleable {
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

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    address public tradingFeeReceiver;
    IOraclePriceFeed public vaultPriceFeed;
    address public addressExecutor;

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IOraclePriceFeed _vaultPriceFeed,
        address _tradingFeeReceiver,
        uint256 _fundingInterval
    ) Roleable(addressProvider) {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        vaultPriceFeed = _vaultPriceFeed;
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

    function updatePairInfo(address newPairInfo) external onlyPoolAdmin {
        address oldPairInfo = address(pairInfo);
        pairInfo = IPairInfo(newPairInfo);
        emit UpdatePairInfo(oldPairInfo, newPairInfo);
    }

    function updatePairVault(address newPairVault) external onlyPoolAdmin {
        address oldPairVault = address(pairVault);
        pairVault = IPairVault(newPairVault);
        emit UpdatePairVault(oldPairVault, newPairVault);
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
    ) external nonReentrant onlyExecutor returns (uint256 tradingFee, int256 fundingFee) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.enable, 'trade pair not supported');

        // get position
        bytes32 positionKey = PositionKey.getPositionKey(_account, _pairIndex, _isLong);
        Position.Info storage position = positions[positionKey];
        position.key = positionKey;

        uint256 sizeDelta = _sizeAmount.mulPrice(_price);
        console.log('increasePosition sizeAmount', _sizeAmount, 'sizeDelta', sizeDelta);

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
        console.log('increasePosition averagePrice', position.averagePrice);

        position.collateral = (int256(position.collateral) + _collateral).abs();
        position.positionAmount = position.positionAmount + _sizeAmount;

        uint256 transferOut = _collateral > 0 ? 0 : _collateral.abs();

        // funding fee
        updateCumulativeFundingRate(_pairIndex, _price);
        fundingFee = getFundingFee(true, _account, _pairIndex, _isLong, _sizeAmount);
        console.log('increasePosition lastFundingTimes', lastFundingTimes[_pairIndex]);
        console.log('increasePosition cumulativeFundingRates', cumulativeFundingRates[_pairIndex].toString());
        console.log('increasePosition fundingFee', fundingFee.toString());

        if (fundingFee >= 0) {
            uint256 absFundingFee = uint256(fundingFee);
            if (_isLong) {
                require(position.collateral >= absFundingFee, 'collateral not enough for funding fee');
                position.collateral -= absFundingFee;
                console.log('increasePosition long pay funding fee');
            } else {
                transferOut += absFundingFee; // todo distribute
                console.log('increasePosition long take funding fee');
            }
        } else {
            uint256 absFundingFee = uint256(-fundingFee);
            if (!_isLong) {
                require(position.collateral >= absFundingFee, 'collateral not enough for funding fee');
                position.collateral = position.collateral - absFundingFee;
                console.log('increasePosition short pay funding fee');
            } else {
                transferOut += absFundingFee; // todo distribute
                console.log('increasePosition short take funding fee');
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = _tradingFee(_pairIndex, _isLong, _sizeAmount, _price);
        require(position.collateral + transferOut >= tradingFee, 'collateral not enough for trading fee');

        if (transferOut >= tradingFee) {
            transferOut -= tradingFee;
        } else {
            transferOut == 0;
            position.collateral -= tradingFee - transferOut;
        }
        // todo distribute
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        console.log('increasePosition tradingFee', tradingFee);

        int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
        netExposureAmountChecker[_pairIndex] =
            prevNetExposureAmountChecker +
            (_isLong ? int256(_sizeAmount) : -int256(_sizeAmount));
        if (_isLong) {
            longTracker[_pairIndex] += _sizeAmount;
        } else {
            shortTracker[_pairIndex] += _sizeAmount;
        }

        console.log('increasePosition prevNetExposureAmountChecker', prevNetExposureAmountChecker.toString());
        console.log('increasePosition netExposureAmountChecker', netExposureAmountChecker[_pairIndex].toString());
        console.log('increasePosition longTracker', longTracker[_pairIndex], 'shortTracker', shortTracker[_pairIndex]);

        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        console.log('increasePosition lp averagePrice', lpVault.averagePrice, 'price', _price);
        uint256 extraIndexAmount;
        if (prevNetExposureAmountChecker > 0) {
            if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                console.log('increasePosition BTO long increase');
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);

                uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);
                console.log('increasePosition BTO update averagePrice', averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log('increasePosition STO long decrease');
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);

                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('increasePosition STO decreaseProfit', profit);
                    extraIndexAmount = pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('increasePosition STO increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                console.log('increasePosition STO long to short');
                pairVault.decreaseReserveAmount(_pairIndex, lpVault.indexReservedAmount, 0);
                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('increasePosition STO decreaseProfit', profit);
                    extraIndexAmount = pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('increasePosition STO increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }

                pairVault.increaseReserveAmount(
                    _pairIndex,
                    0,
                    (_sizeAmount - uint256(prevNetExposureAmountChecker)).mulPrice(_price)
                );
                console.log('increasePosition STO Long to Short update averagePrice', _price);
                pairVault.updateAveragePrice(_pairIndex, _price);
            }
        } else if (prevNetExposureAmountChecker < 0) {
            if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                console.log('increasePosition STO short increase');
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                uint256 averagePrice = (uint256(-prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(-prevNetExposureAmountChecker) + _sizeAmount);
                console.log('increasePosition STO update averagePrice', averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] < 0) {
                console.log('increasePosition BTO short decrease');
                pairVault.decreaseReserveAmount(_pairIndex, 0, _sizeAmount.mulPrice(lpVault.averagePrice));

                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('increasePosition BTO decreaseProfit', profit);
                    extraIndexAmount = pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('increasePosition BTO increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                console.log('increasePosition BTO short to long');
                pairVault.decreaseReserveAmount(_pairIndex, 0, lpVault.stableReservedAmount);
                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('increasePosition BTO increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('increasePosition BTO decreaseProfit', profit);
                    extraIndexAmount = pairVault.decreaseProfit(_pairIndex, profit);
                }

                pairVault.increaseReserveAmount(
                    _pairIndex,
                    0,
                    (_sizeAmount - uint256(-prevNetExposureAmountChecker)).mulPrice(_price)
                );
                console.log('increasePosition BTO Long to Short update averagePrice', _price);
                pairVault.updateAveragePrice(_pairIndex, _price);
            }
        } else {
            if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log('increasePosition BTO zero to long');
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log('increasePosition STO zero to short');
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, _price);
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

        console.log('increase position finish');
    }

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong,
        uint256 _price
    ) external onlyExecutor nonReentrant returns (uint256 tradingFee, int256 fundingFee, int256 pnl) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
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
        console.log('decreasePosition sizeAmount', _sizeAmount, 'sizeDelta', sizeDelta);

        position.collateral = (int256(position.collateral) + _collateral).abs();
        position.positionAmount -= _sizeAmount;
        console.log(
            'decreasePosition position collateral',
            position.collateral,
            'positionAmount',
            position.positionAmount
        );

        uint256 transferOut = _collateral > 0 ? 0 : _collateral.abs();

        // funding fee
        updateCumulativeFundingRate(_pairIndex, _price);
        fundingFee = getFundingFee(false, _account, _pairIndex, _isLong, _sizeAmount);
        console.log('decreasePosition lastFundingTimes', lastFundingTimes[_pairIndex]);
        console.log('decreasePosition cumulativeFundingRates', cumulativeFundingRates[_pairIndex].toString());
        console.log('decreasePosition fundingFee', fundingFee.toString());

        if (fundingFee >= 0) {
            uint256 absFundingFee = uint256(fundingFee);
            if (_isLong) {
                require(position.collateral >= absFundingFee, 'collateral not enough for funding fee');
                position.collateral -= absFundingFee;
                console.log('decreasePosition long pay funding fee');
            } else {
                transferOut += absFundingFee; // todo distribute
                console.log('decreasePosition long take funding fee');
            }
        } else {
            uint256 absFundingFee = uint256(-fundingFee);
            if (!_isLong) {
                require(position.collateral >= absFundingFee, 'collateral not enough for funding fee');
                position.collateral = position.collateral - absFundingFee;
                console.log('decreasePosition short pay funding fee');
            } else {
                transferOut += absFundingFee; // todo distribute
                console.log('decreasePosition short take funding fee');
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = _tradingFee(_pairIndex, !_isLong, _sizeAmount, _price);
        require(position.collateral + transferOut >= tradingFee, 'collateral not enough for trading fee');

        if (transferOut >= tradingFee) {
            transferOut -= tradingFee;
        } else {
            transferOut == 0;
            position.collateral -= tradingFee - transferOut;
        }
        // todo fee distribute
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        console.log('decreasePosition tradingFee', tradingFee);

        int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
        netExposureAmountChecker[_pairIndex] =
            prevNetExposureAmountChecker +
            (_isLong ? -int256(_sizeAmount) : int256(_sizeAmount));
        if (_isLong) {
            longTracker[_pairIndex] -= _sizeAmount;
        } else {
            shortTracker[_pairIndex] -= _sizeAmount;
        }

        console.log('decreasePosition prevNetExposureAmountChecker', prevNetExposureAmountChecker.toString());
        console.log('decreasePosition netExposureAmountChecker', netExposureAmountChecker[_pairIndex].toString());
        console.log('decreasePosition longTracker', longTracker[_pairIndex], 'shortTracker', shortTracker[_pairIndex]);

        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        if (prevNetExposureAmountChecker > 0) {
            if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                console.log('decreasePosition STC long increase');
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);
                console.log('decreasePosition STC update averagePrice', averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log('decreasePosition BTC long decrease');
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);

                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('decreasePosition BTC decreaseProfit', profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('decreasePosition BTC increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                console.log('decreasePosition BTC long to short');
                pairVault.decreaseReserveAmount(_pairIndex, lpVault.indexReservedAmount, 0);
                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('decreasePosition BTC decreaseProfit', profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('decreasePosition BTC increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
                pairVault.increaseReserveAmount(
                    _pairIndex,
                    0,
                    (_sizeAmount - uint256(prevNetExposureAmountChecker)).mulPrice(_price)
                );
                console.log('decreasePosition BTC Long to Short update averagePrice', _price);
                pairVault.updateAveragePrice(_pairIndex, _price);
            }
        } else if (prevNetExposureAmountChecker < 0) {
            if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                console.log('decreasePosition BTC short increase');
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                uint256 averagePrice = (uint256(-prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(-prevNetExposureAmountChecker) + _sizeAmount);
                console.log('decreasePosition BTC update averagePrice', averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] < 0) {
                console.log('decreasePosition STC short decrease');
                pairVault.decreaseReserveAmount(_pairIndex, 0, _sizeAmount.mulPrice(lpVault.averagePrice));

                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('decreasePosition STC decreaseProfit', profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('decreasePosition STC increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                console.log('decreasePosition STC short to long');
                pairVault.decreaseReserveAmount(_pairIndex, 0, lpVault.stableReservedAmount);
                if (_price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(_price - lpVault.averagePrice);
                    console.log('decreasePosition STC increaseProfit', profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - _price);
                    console.log('decreasePosition STC decreaseProfit', profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                }
                pairVault.increaseReserveAmount(
                    _pairIndex,
                    0,
                    (_sizeAmount - uint256(-prevNetExposureAmountChecker)).mulPrice(_price)
                );
                console.log('decreasePosition STC Long to Short update averagePrice', _price);
                pairVault.updateAveragePrice(_pairIndex, _price);
            }
        } else {
            if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log('decreasePosition STC zero to long');
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log('decreasePosition BTC zero to short');
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, _price);
        }
        uint256 price = vaultPriceFeed.getPrice(pair.indexToken);
        pnl = position.getUnrealizedPnl(_sizeAmount, price);
        console.log('decreasePosition pnl', pnl.toString());

        if (pnl > 0) {
            transferOut += pnl.abs();
        } else {
            position.collateral -= position.collateral.min(uint256(-pnl));
        }
        position.realisedPnl += pnl;

        console.log('decreasePosition collateral', position.collateral);

        if (transferOut > 0) {
            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }

        if (position.positionAmount == 0) {
            if (position.collateral > 0) {
                IERC20(pair.stableToken).safeTransfer(position.account, position.collateral);
            }

            console.log('decreasePosition position close');
            delete positions[positionKey];
            emit ClosePosition(positionKey, _account, _pairIndex, _isLong);
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

    function updateCumulativeFundingRate(uint256 _pairIndex, uint256 _price) public {
        console.log('updateCumulativeFundingRate pairIndex', _pairIndex, 'price', _price);

        if (lastFundingTimes[_pairIndex] == 0) {
            lastFundingTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
            return;
        }

        if (block.timestamp - lastFundingTimes[_pairIndex] < fundingInterval) {
            console.log('updateCumulativeFundingRate no need update');
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
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = vaultPriceFeed.getPrice(pair.indexToken);
        return _tradingFee(_pairIndex, _isLong, _sizeAmount, price);
    }

    function _tradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount,
        uint256 _price
    ) internal view returns (uint256 tradingFee) {
        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        IPairInfo.TradingFeeConfig memory tradingFeeConfig = pairInfo.getTradingFeeConfig(_pairIndex);
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
            if (!_increase) {
                int256 fundingRate = (lastFundingRates[_pairIndex] * int256(interval)) / int256(fundingInterval);
                return (int256(_sizeAmount) * fundingRate) / int256(PrecisionUtils.fundingRatePrecision());
            }
        }

        int256 fundingRate = cumulativeFundingRates[_pairIndex] - position.entryFundingRate;
        return (int256(position.positionAmount) * fundingRate) / int256(PrecisionUtils.fundingRatePrecision());
    }

    function getCurrentFundingRate(uint256 _pairIndex) external view override returns (int256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = vaultPriceFeed.getPrice(pair.indexToken);
        return _currentFundingRate(_pairIndex, price);
    }

    function _currentFundingRate(uint256 _pairIndex, uint256 _price) internal view returns (int256 fundingRate) {
        console.log('currentFundingRate pairIndex', _pairIndex, '_price', _price);

        IPairInfo.FundingFeeConfig memory fundingFeeConfig = pairInfo.getFundingFeeConfig(_pairIndex);

        uint256 absNetExposure = netExposureAmountChecker[_pairIndex].abs();
        uint256 w = fundingFeeConfig.fundingWeightFactor;
        uint256 q = longTracker[_pairIndex] + shortTracker[_pairIndex];
        uint256 k = fundingFeeConfig.liquidityPremiumFactor;
        console.log('currentFundingRate w %s q %s k %s', w, q, k);

        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        uint256 l = (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(_price) +
            (lpVault.stableTotalAmount - lpVault.stableReservedAmount);
        console.log('currentFundingRate l', l);

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

        fundingRate = (fundingRate - fundingFeeConfig.interest).min(fundingFeeConfig.minFundingRate).max(
            fundingFeeConfig.maxFundingRate
        );
        console.log('getCurrentFundingRate fundingRate', fundingRate.toString());
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
}
