// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

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

contract PositionManager is FeeManager, Pausable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using SafeMath for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    mapping(bytes32 => Position.Info) public positions;

    mapping(uint256 => uint256) public override longTracker;
    mapping(uint256 => uint256) public override shortTracker;

    // gobleFundingRateIndex tracks the funding rates based on utilization
    mapping(uint256 => int256) public globalFundingFeeTracker;

    mapping(uint256 => int256) public currentFundingRate;

    // lastFundingRateUpdateTimes tracks the last time funding was updated for a token
    mapping(uint256 => uint256) public lastFundingRateUpdateTimes;

    uint256 public fundingInterval;

    address public addressExecutor;
    address public addressOrderManager;

    constructor(
        IAddressesProvider addressProvider,
        IPool pool,
        address _pledgeAddress,
        IFeeCollector feeCollector,
        uint256 _fundingInterval
    ) FeeManager(addressProvider, pool, _pledgeAddress, feeCollector) {
        fundingInterval = _fundingInterval;
    }

    modifier onlyExecutor() {
        require(msg.sender == addressExecutor, 'forbidden');
        _;
    }

    function setPaused() external onlyAdmin {
        _pause();
    }

    function setUnPaused() external onlyAdmin {
        _unpause();
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
        uint256 vipRate,
        uint256 referenceRate,
        uint256 _price
    ) internal returns (int256 charge, uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);

        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        tradingFee = _tradingFee(_pairIndex, _isLong, sizeDelta);
        charge -= int256(tradingFee);

        uint256 lpAmount = _distributeTradingFee(
            pair,
            _account,
            _keeper,
            sizeDelta,
            tradingFee,
            vipRate,
            referenceRate
        );

        fundingFee = getFundingFee(_account, _pairIndex, _isLong);
        charge += fundingFee;
        emit TakeFundingFeeAddTraderFee(_account, _pairIndex, sizeDelta, tradingFee, fundingFee, lpAmount);
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
            _isLong ? longTracker[_pairIndex] += _sizeAmount : shortTracker[_pairIndex] += _sizeAmount;
        } else {
            _isLong ? longTracker[_pairIndex] -= _sizeAmount : shortTracker[_pairIndex] -= _sizeAmount;
        }
        int256 nextExposureAmountChecker = getExposedPositions(_pairIndex);
        uint256 sizeDelta = _sizeAmount.mulPrice(_price);

        PositionStatus currentPositionStatus = PositionStatus.Balance;
        if (currentExposureAmountChecker > 0) {
            currentPositionStatus = PositionStatus.NetLong;
        } else if (currentExposureAmountChecker < 0) {
            currentPositionStatus = PositionStatus.NetShort;
        }

        PositionStatus nextPositionStatus = PositionStatus.Balance;
        if (nextExposureAmountChecker > 0) {
            nextPositionStatus = PositionStatus.NetLong;
        } else if (nextExposureAmountChecker < 0) {
            nextPositionStatus = PositionStatus.NetShort;
        }

        bool isAddPosition = (currentPositionStatus == PositionStatus.NetLong &&
            nextExposureAmountChecker > currentExposureAmountChecker) ||
            (currentPositionStatus == PositionStatus.NetShort &&
                nextExposureAmountChecker < currentExposureAmountChecker);

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
                _calLpProfit(_pairIndex, false, decreaseLong);

                // increase reserve
                if (increaseShort > 0) {
                    pool.increaseReserveAmount(_pairIndex, 0, increaseShort.mulPrice(_price));
                    pool.updateAveragePrice(_pairIndex, _price);
                }
            }
        } else if (currentPositionStatus == PositionStatus.NetShort) {
            if (isAddPosition) {
                pool.increaseReserveAmount(_pairIndex, 0, sizeDelta);

                uint256 averagePrice = (uint256(-currentExposureAmountChecker).mulPrice(lpVault.averagePrice) +
                    sizeDelta).calculatePrice(uint256(-currentExposureAmountChecker) + _sizeAmount);
                pool.updateAveragePrice(_pairIndex, averagePrice);
            } else {
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
                _calLpProfit(_pairIndex, true, decreaseShort);
                // increase reserve
                if (increaseLong > 0) {
                    pool.increaseReserveAmount(_pairIndex, increaseLong, 0);
                    pool.updateAveragePrice(_pairIndex, _price);
                }
            }
        }
        // zero exposure
        if (nextPositionStatus == PositionStatus.Balance) {
            pool.updateAveragePrice(_pairIndex, 0);
        }
    }

    function _calLpProfit(uint256 _pairIndex, bool lpIsLong, uint amount) internal {
        int256 profit = _currentLpProfit(_pairIndex, lpIsLong, amount);
        pool.setLPProfit(_pairIndex, profit);
    }

    function lpProfit(uint pairIndex, address token) external view override returns (int256) {
        if (token != pledgeAddress) {
            return 0;
        }
        int256 currentExposureAmountChecker = getExposedPositions(pairIndex);
        int256 profit = _currentLpProfit(
            pairIndex,
            currentExposureAmountChecker > 0,
            currentExposureAmountChecker.abs()
        );
        return profit;
    }

    function _currentLpProfit(uint256 _pairIndex, bool lpIsLong, uint amount) internal view returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        uint256 _price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        if (lpIsLong) {
            if (_price > lpVault.averagePrice) {
                return int256(amount.mulPrice(_price - lpVault.averagePrice));
            } else {
                return -int256(amount.mulPrice(lpVault.averagePrice - _price));
            }
        } else {
            if (_price < lpVault.averagePrice) {
                return int256(amount.mulPrice(lpVault.averagePrice - _price));
            } else {
                return -int256(amount.mulPrice(_price - lpVault.averagePrice));
            }
        }
    }

    function increasePosition(
        uint256 pairIndex,
        uint256 orderId,
        address account,
        address keeper,
        uint256 sizeAmount,
        bool isLong,
        int256 collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 oraclePrice
    ) external nonReentrant onlyExecutor whenNotPaused returns (uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(pairIndex);
        require(pair.stableToken == pledgeAddress, '!=plege');
        bytes32 positionKey = PositionKey.getPositionKey(account, pairIndex, isLong);
        Position.Info storage position = positions[positionKey];

        uint256 beforeCollateral = position.collateral;
        uint256 beforePositionAmount = position.positionAmount;
        uint256 sizeDelta = sizeAmount.mulPrice(oraclePrice);

        if (position.positionAmount == 0) {
            position.init(pairIndex, account, isLong, oraclePrice);
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) + sizeDelta).mulDiv(
                PrecisionUtils.pricePrecision(),
                (position.positionAmount + sizeAmount)
            );
        }

        // update funding fee
        _updateFundingRate(pairIndex, oraclePrice);
        _handleCollateral(position, collateral);
        // settlement trading fee and funding fee
        int256 charge;
        (charge, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            pairIndex,
            account,
            keeper,
            sizeAmount,
            isLong,
            vipRate,
            referenceRate,
            oraclePrice
        );

        charge < 0 ? position.collateral = position.collateral.sub(charge.abs()) : position.collateral = position
            .collateral
            .add(charge.abs());
        position.fundingFeeTracker = globalFundingFeeTracker[pairIndex];
        position.positionAmount += sizeAmount;

        // settlement lp position
        _settleLPPosition(pairIndex, sizeAmount, isLong, true, oraclePrice);
        emit UpdatePosition(
            account,
            positionKey,
            pairIndex,
            orderId,
            isLong,
            beforeCollateral,
            position.collateral,
            oraclePrice,
            beforePositionAmount,
            position.positionAmount,
            position.averagePrice,
            position.fundingFeeTracker,
            0
        );
    }

    function decreasePosition(
        uint256 pairIndex,
        uint256 orderId,
        address account,
        address keeper,
        uint256 sizeAmount,
        bool isLong,
        int256 collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 oraclePrice
    ) external onlyExecutor nonReentrant whenNotPaused returns (uint256 tradingFee, int256 fundingFee, int256 pnl) {
        bytes32 positionKey = PositionKey.getPositionKey(account, pairIndex, isLong);
        Position.Info storage position = positions[positionKey];
        require(position.account != address(0), 'position not found');

        uint256 beforeCollateral = position.collateral;
        uint256 beforePositionAmount = position.positionAmount;

        // update funding fee
        _updateFundingRate(pairIndex, oraclePrice);
        _handleCollateral(position, collateral);
        // settlement trading fee and funding fee
        int256 charge;
        (charge, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            pairIndex,
            account,
            keeper,
            sizeAmount,
            isLong,
            vipRate,
            referenceRate,
            oraclePrice
        );

        position.fundingFeeTracker = globalFundingFeeTracker[pairIndex];
        position.positionAmount -= sizeAmount;

        // settlement lp position
        _settleLPPosition(pairIndex, sizeAmount, isLong, false, oraclePrice);

        pnl = position.getUnrealizedPnl(sizeAmount, oraclePrice);
        pnl += charge;
        pnl < 0 ? position.collateral = position.collateral.sub(pnl.abs()) : position.collateral = position
            .collateral
            .add(pnl.abs());
        if (position.positionAmount == 0) {
            pool.transferTokenTo(pledgeAddress, position.account, position.collateral);
            position.collateral = 0;
        }
        emit UpdatePosition(
            account,
            positionKey,
            pairIndex,
            orderId,
            isLong,
            beforeCollateral,
            position.collateral,
            oraclePrice,
            beforePositionAmount,
            position.positionAmount,
            position.averagePrice,
            position.fundingFeeTracker,
            pnl
        );
    }

    function adjustCollateral(uint256 pairIndex, address account, bool isLong, int256 collateral) external override {
        require(account == msg.sender || addressExecutor == msg.sender, 'forbidden');
        IPool.Pair memory pair = pool.getPair(pairIndex);
        Position.Info storage position = positions[PositionKey.getPositionKey(account, pairIndex, isLong)];
        uint256 collateralBefore = position.collateral;
        _handleCollateral(position, collateral);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);
        (uint256 afterPosition, ) = position.validLeverage(
            price,
            0,
            0,
            false,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );
        require(afterPosition > 0, 'zero position amount');

        emit AdjustCollateral(
            position.account,
            position.pairIndex,
            position.isLong,
            collateralBefore,
            position.collateral
        );
    }

    function _handleCollateral(Position.Info storage position, int256 collateral) internal {
        uint256 collateralBefore = position.collateral;
        if (collateral < 0) {
            position.collateral = position.collateral.sub(collateral.abs());
            pool.transferTokenTo(pledgeAddress, position.account, collateral.abs());
        } else {
            position.collateral = position.collateral.add(collateral.abs());
        }
        require(position.collateral >= 0, 'collateral not enough');
    }

    function getTradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) external view override returns (uint256 tradingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        uint256 sizeDelta = _sizeAmount.mulPrice(price);
        return _tradingFee(_pairIndex, _isLong, sizeDelta);
    }

    function _tradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 sizeDelta
    ) internal view returns (uint256 tradingFee) {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(_pairIndex);
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex);
        if (currentExposureAmountChecker >= 0) {
            // fee
            tradingFee = _isLong
                ? sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP)
                : sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP);
        } else {
            tradingFee = _isLong
                ? sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP)
                : sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP);
        }
        return tradingFee;
    }

    function getFundingFee(
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) public view override returns (int256 fundingFee) {
        Position.Info memory position = positions.get(_account, _pairIndex, _isLong);
        int256 fundingFeeTracker = globalFundingFeeTracker[_pairIndex] - position.fundingFeeTracker;
        if ((_isLong && fundingFeeTracker > 0) || (!_isLong && fundingFeeTracker < 0)) {
            fundingFee = -1;
        } else {
            fundingFee = 1;
        }
        fundingFee *=
            (int256(position.positionAmount) * fundingFeeTracker) /
            int256(PrecisionUtils.fundingRatePrecision());
    }

    function updateFundingRate(uint256 _pairIndex) external whenNotPaused {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        _updateFundingRate(_pairIndex, price);
    }

    function _updateFundingRate(uint256 _pairIndex, uint256 _price) internal {
        if (lastFundingRateUpdateTimes[_pairIndex] == 0) {
            lastFundingRateUpdateTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
            return;
        }
        if (block.timestamp - lastFundingRateUpdateTimes[_pairIndex] < fundingInterval) {
            return;
        }
        int256 nextFundingRate = _nextFundingRate(_pairIndex, _price);

        globalFundingFeeTracker[_pairIndex] =
            globalFundingFeeTracker[_pairIndex] +
            (nextFundingRate * int256(_price)) /
            int256(PrecisionUtils.pricePrecision());
        lastFundingRateUpdateTimes[_pairIndex] = (block.timestamp / fundingInterval) * fundingInterval;
        currentFundingRate[_pairIndex] = nextFundingRate;

        // fund rate for settlement lp
        uint256 lpPosition;
        if (longTracker[_pairIndex] > shortTracker[_pairIndex]) {
            lpPosition = longTracker[_pairIndex] - shortTracker[_pairIndex];
            pool.setLPProfit(
                _pairIndex,
                (nextFundingRate * int256(lpPosition)) / int256(PrecisionUtils.fundingRatePrecision())
            );
        } else {
            lpPosition = shortTracker[_pairIndex] - longTracker[_pairIndex];
            pool.setLPProfit(
                _pairIndex,
                (-nextFundingRate * int256(lpPosition)) / int256(PrecisionUtils.fundingRatePrecision())
            );
        }

        emit UpdateFundingRate(_pairIndex, _price, nextFundingRate, lastFundingRateUpdateTimes[_pairIndex]);
    }

    function getCurrentFundingRate(uint256 _pairIndex) external view override returns (int256) {
        return currentFundingRate[_pairIndex];
    }

    function getNextFundingRate(uint256 _pairIndex) external view override returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        return _nextFundingRate(_pairIndex, price);
    }

    function getNextFundingRateUpdateTime(uint256 _pairIndex) external view override returns (uint256) {
        return lastFundingRateUpdateTimes[_pairIndex] + fundingInterval;
    }

    function _nextFundingRate(uint256 _pairIndex, uint256 _price) internal view returns (int256 fundingRate) {
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex) * int256(_price);

        int256 w = int256(fundingFeeConfig.fundingWeightFactor);
        int256 q = int256(longTracker[_pairIndex] + shortTracker[_pairIndex]);
        int256 k = int256(fundingFeeConfig.liquidityPremiumFactor);

        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        int256 l = int256(
            (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(_price) +
                (lpVault.stableTotalAmount - lpVault.stableReservedAmount)
        );

        if (q == 0) {
            fundingRate = 0;
        } else {
            fundingRate = (w * currentExposureAmountChecker * int256(PrecisionUtils.fundingRatePrecision())) / (k * q);
            if (l != 0) {
                fundingRate =
                    fundingRate +
                    ((int256(PrecisionUtils.fundingRatePrecision()) - w) * currentExposureAmountChecker) /
                    (k * l);
            }
        }
        fundingRate = (fundingRate - fundingFeeConfig.interest).max(fundingFeeConfig.minFundingRate).min(
            fundingFeeConfig.maxFundingRate
        );
        fundingRate = fundingRate / int256(365) / int256(86400 / fundingInterval);
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
