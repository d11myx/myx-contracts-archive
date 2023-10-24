// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {PositionStatus, IPositionManager} from "../interfaces/IPositionManager.sol";
import "../libraries/Position.sol";
import "../libraries/PositionKey.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../interfaces/IFundingRate.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IRiskReserve.sol";
import "../interfaces/IFeeCollector.sol";
import "../libraries/Upgradeable.sol";
import "../helpers/TokenHelper.sol";
import "../helpers/TokenHelper.sol";

contract PositionManager is IPositionManager, Upgradeable {
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

    // uint256 public fundingInterval = 28800;

    IRiskReserve public riskReserve;
    IPool public pool;
    IFeeCollector public feeCollector;
    address public pledgeAddress;

    address public executionLogic;
    address public liquidationLogic;

    // constructor() FeeManager() Pausable() {}
    function initialize(
        IAddressesProvider addressProvider,
        IPool _pool,
        address _pledgeAddress,
        IFeeCollector _feeCollector,
        IRiskReserve _riskReserve
    ) public initializer {
        ADDRESS_PROVIDER = addressProvider;
        pledgeAddress = _pledgeAddress;
        pool = _pool;
        feeCollector = _feeCollector;
        riskReserve = _riskReserve;
    }

    modifier onlyExecutor() {
        require(msg.sender == executionLogic || msg.sender == liquidationLogic, "onlyExecutor");
        _;
    }

    function updateExecutionLogic(address _executionLogic) external onlyPoolAdmin {
        address oldAddress = executionLogic;
        executionLogic = _executionLogic;
        emit UpdatedExecutionLogic(msg.sender, oldAddress, executionLogic);
    }

    function updateLiquidationLogic(address _liquidationLogic) external onlyPoolAdmin {
        address oldAddress = liquidationLogic;
        liquidationLogic = _liquidationLogic;
        emit UpdatedLiquidationLogic(msg.sender, oldAddress, liquidationLogic);
    }

    function increasePosition(
        uint256 pairIndex,
        uint256 orderId,
        address account,
        address keeper,
        uint256 sizeAmount,
        bool isLong,
        int256 collateral,
        IFeeCollector.LevelDiscount memory discount,
        uint256 referralRate,
        uint256 oraclePrice
    ) external onlyExecutor returns (uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(pairIndex);
        require(pair.stableToken == pledgeAddress, "!pledge");
        bytes32 positionKey = PositionKey.getPositionKey(account, pairIndex, isLong);
        Position.Info storage position = positions[positionKey];

        uint256 beforeCollateral = position.collateral;
        uint256 beforePositionAmount = position.positionAmount;
        uint256 sizeDelta = sizeAmount.mulPrice(oraclePrice);

        if (position.positionAmount == 0) {
            position.init(pairIndex, account, isLong, oraclePrice);
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) +
                sizeDelta).mulDiv(
                    PrecisionUtils.pricePrecision(),
                    (position.positionAmount + sizeAmount)
                );
        }

        // update funding fee
        _updateFundingRate(pairIndex, oraclePrice);
        _handleCollateral(pairIndex, position, collateral);

        // settlement trading fee and funding fee
        int256 charge;
        (charge, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            pairIndex,
            account,
            keeper,
            sizeAmount,
            isLong,
            discount,
            referralRate,
            oraclePrice
        );

        int256 totalSettlementAmount = charge;
        if (totalSettlementAmount >= 0) {
            position.collateral = position.collateral.add(totalSettlementAmount.abs());
        } else {
            if (position.collateral >= totalSettlementAmount.abs()) {
                position.collateral = position.collateral.sub(totalSettlementAmount.abs());
            } else {
                // adjust position averagePrice
                uint256 lossPer = totalSettlementAmount.abs().divPrice(position.positionAmount);
                position.isLong
                    ? position.averagePrice = position.averagePrice + lossPer
                    : position.averagePrice = position.averagePrice - lossPer;
            }
        }

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
        IFeeCollector.LevelDiscount memory discount,
        uint256 referralRate,
        uint256 oraclePrice,
        bool useRiskReserve
    ) external onlyExecutor returns (uint256 tradingFee, int256 fundingFee, int256 pnl) {
        bytes32 positionKey = PositionKey.getPositionKey(account, pairIndex, isLong);
        Position.Info storage position = positions[positionKey];
        require(position.account != address(0), "!0");

        uint256 beforeCollateral = position.collateral;
        uint256 beforePositionAmount = position.positionAmount;

        // update funding fee
        _updateFundingRate(pairIndex, oraclePrice);

        // settlement trading fee and funding fee
        int256 charge;
        (charge, tradingFee, fundingFee) = _takeFundingFeeAddTraderFee(
            pairIndex,
            account,
            keeper,
            sizeAmount,
            isLong,
            discount,
            referralRate,
            oraclePrice
        );

        position.fundingFeeTracker = globalFundingFeeTracker[pairIndex];
        position.positionAmount -= sizeAmount;

        IPool.Pair memory pair = pool.getPair(pairIndex);

        // settlement lp position
        _settleLPPosition(pairIndex, sizeAmount, isLong, false, oraclePrice);

        pnl = position.getUnrealizedPnl(sizeAmount, oraclePrice);

        int256 totalSettlementAmount = pnl + charge;
        if (totalSettlementAmount >= 0) {
            position.collateral = position.collateral.add(totalSettlementAmount.abs());
        } else {
            if (position.collateral >= totalSettlementAmount.abs()) {
                position.collateral = position.collateral.sub(totalSettlementAmount.abs());
            } else {
                if (position.positionAmount == 0) {
                    uint256 subsidy = totalSettlementAmount.abs() - position.collateral;
                    riskReserve.decrease(pair.stableToken, subsidy);
                    position.collateral = position.collateral.sub(
                        int256(totalSettlementAmount + int256(subsidy)).abs()
                    );
                } else {
                    // adjust position averagePrice
                    uint256 lossPer = totalSettlementAmount.abs().divPrice(position.positionAmount);
                    position.isLong
                        ? position.averagePrice = position.averagePrice + lossPer
                        : position.averagePrice = position.averagePrice - lossPer;
                }
            }
        }

        _handleCollateral(pairIndex, position, collateral);

        if (position.positionAmount == 0 && position.collateral > 0) {
            if (useRiskReserve) {
                pool.setLPStableProfit(pairIndex, -int256(position.collateral));
                riskReserve.increase(pair.stableToken, position.collateral);
            } else {
                pool.transferTokenOrSwap(
                    pairIndex,
                    pledgeAddress,
                    position.account,
                    position.collateral
                );
            }
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

    function adjustCollateral(
        uint256 pairIndex,
        address account,
        bool isLong,
        int256 collateral
    ) external override {
        require(account == msg.sender, "forbidden");

        IPool.Pair memory pair = pool.getPair(pairIndex);
        Position.Info storage position = positions[
            PositionKey.getPositionKey(account, pairIndex, isLong)
        ];

        uint256 price = IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);
        position.validLeverage(
            pair,
            price,
            collateral,
            0,
            true,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );

        if (collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(pool), uint256(collateral));
        }

        uint256 collateralBefore = position.collateral;
        _handleCollateral(pairIndex, position, collateral);

        emit AdjustCollateral(
            position.account,
            position.pairIndex,
            position.isLong,
            collateralBefore,
            position.collateral
        );
    }

    function updateFundingRate(uint256 _pairIndex) external {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        _updateFundingRate(_pairIndex, price);
    }

    function _takeFundingFeeAddTraderFee(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        IFeeCollector.LevelDiscount memory discount,
        uint256 referralRate,
        uint256 _price
    ) internal returns (int256 charge, uint256 tradingFee, int256 fundingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 sizeDeltaStable = uint256(TokenHelper.convertIndexAmountToStableWithPrice(pair, int256(_sizeAmount), _price));

        bool isTaker;
        (tradingFee, isTaker) = _tradingFee(_pairIndex, _isLong, sizeDeltaStable);
        charge -= int256(tradingFee);

        uint256 lpAmount = feeCollector.distributeTradingFee(
            pair,
            _account,
            _keeper,
            sizeDeltaStable,
            tradingFee,
            isTaker ? discount.takerDiscountRatio : discount.makerDiscountRatio,
            referralRate
        );

        fundingFee = getFundingFee(_account, _pairIndex, _isLong);
        charge += fundingFee;
        emit TakeFundingFeeAddTraderFee(
            _account,
            _pairIndex,
            sizeDeltaStable,
            tradingFee,
            fundingFee,
            lpAmount
        );
    }

    function _currentLpProfit(
        uint256 _pairIndex,
        bool lpIsLong,
        uint amount
    ) internal view returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        uint256 _price = IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
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
            _isLong
                ? longTracker[_pairIndex] += _sizeAmount
                : shortTracker[_pairIndex] += _sizeAmount;
        } else {
            _isLong
                ? longTracker[_pairIndex] -= _sizeAmount
                : shortTracker[_pairIndex] -= _sizeAmount;
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

                uint256 averagePrice = (uint256(currentExposureAmountChecker).mulPrice(
                    lpVault.averagePrice
                ) + sizeDelta).calculatePrice(uint256(currentExposureAmountChecker) + _sizeAmount);

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

                uint256 averagePrice = (uint256(-currentExposureAmountChecker).mulPrice(
                    lpVault.averagePrice
                ) + sizeDelta).calculatePrice(uint256(-currentExposureAmountChecker) + _sizeAmount);
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
        pool.setLPStableProfit(_pairIndex, profit);
    }

    function _handleCollateral(
        uint256 pairIndex,
        Position.Info storage position,
        int256 collateral
    ) internal {
        if (collateral == 0) {
            return;
        }
        if (collateral < 0) {
            require(position.collateral >= collateral.abs(), "collateral not enough");
            position.collateral = position.collateral.sub(collateral.abs());
            pool.transferTokenOrSwap(pairIndex, pledgeAddress, position.account, collateral.abs());
        } else {
            position.collateral = position.collateral.add(collateral.abs());
        }
    }

    function _tradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 sizeDeltaStable
    ) internal view returns (uint256 tradingFee, bool isTaker) {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(_pairIndex);
        int256 currentExposureAmountChecker = getExposedPositions(_pairIndex);
        if (currentExposureAmountChecker >= 0) {
            // fee
            tradingFee = _isLong
                ? sizeDeltaStable.mulPercentage(tradingFeeConfig.takerFeeP)
                : sizeDeltaStable.mulPercentage(tradingFeeConfig.makerFeeP);
            isTaker = _isLong;
        } else {
            tradingFee = _isLong
                ? sizeDeltaStable.mulPercentage(tradingFeeConfig.makerFeeP)
                : sizeDeltaStable.mulPercentage(tradingFeeConfig.takerFeeP);
            isTaker = !_isLong;
        }
        return (tradingFee, isTaker);
    }

    function _updateFundingRate(uint256 _pairIndex, uint256 _price) internal {
        uint256 fundingInterval = IFundingRate(ADDRESS_PROVIDER.fundingRate()).getFundingInterval(
            _pairIndex
        );
        if (lastFundingRateUpdateTimes[_pairIndex] == 0) {
            lastFundingRateUpdateTimes[_pairIndex] =
                (block.timestamp / fundingInterval) *
                fundingInterval;
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
        lastFundingRateUpdateTimes[_pairIndex] =
            (block.timestamp / fundingInterval) *
            fundingInterval;
        currentFundingRate[_pairIndex] = nextFundingRate;

        IPool.Vault memory vault = pool.getVault(_pairIndex);

        // fund rate for settlement lp
        if (longTracker[_pairIndex] > shortTracker[_pairIndex]) {
            uint256 lpPosition = longTracker[_pairIndex] - shortTracker[_pairIndex];
            int256 profit = (nextFundingRate * int256(lpPosition)) /
                int256(PrecisionUtils.fundingRatePrecision());
            uint256 priceChangePer = profit.abs().calculatePrice(lpPosition);
            if (profit > 0) {
                pool.updateAveragePrice(_pairIndex, vault.averagePrice + priceChangePer);
            } else if (profit < 0) {
                pool.updateAveragePrice(_pairIndex, vault.averagePrice - priceChangePer);
            }
        } else if (longTracker[_pairIndex] < shortTracker[_pairIndex]) {
            uint256 lpPosition = shortTracker[_pairIndex] - longTracker[_pairIndex];
            int256 profit = (-nextFundingRate * int256(lpPosition)) /
                int256(PrecisionUtils.fundingRatePrecision());
            uint256 priceChangePer = profit.abs().calculatePrice(lpPosition);
            if (profit > 0) {
                pool.updateAveragePrice(_pairIndex, vault.averagePrice - priceChangePer);
            } else if (profit < 0) {
                pool.updateAveragePrice(_pairIndex, vault.averagePrice + priceChangePer);
            }
        }

        emit UpdateFundingRate(
            _pairIndex,
            _price,
            nextFundingRate,
            lastFundingRateUpdateTimes[_pairIndex]
        );
    }

    function _nextFundingRate(
        uint256 _pairIndex,
        uint256 _price
    ) internal view returns (int256 fundingRate) {
        IPool.Vault memory vault = pool.getVault(_pairIndex);

        fundingRate = IFundingRate(ADDRESS_PROVIDER.fundingRate()).getFundingRate(
            _pairIndex,
            longTracker[_pairIndex],
            shortTracker[_pairIndex],
            vault,
            _price
        );
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

    function getTradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) external view override returns (uint256 tradingFee) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        uint256 sizeDeltaStable = uint256(
            TokenHelper.convertIndexAmountToStableWithPrice(pair, int256(_sizeAmount), price)
        );

        (tradingFee, ) = _tradingFee(_pairIndex, _isLong, sizeDeltaStable);
        return tradingFee;
    }

    function getFundingFee(
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) public view override returns (int256 fundingFee) {
        Position.Info memory position = positions.get(_account, _pairIndex, _isLong);
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        int256 fundingFeeTracker = globalFundingFeeTracker[_pairIndex] - position.fundingFeeTracker;
        if ((_isLong && fundingFeeTracker > 0) || (!_isLong && fundingFeeTracker < 0)) {
            fundingFee = -1;
        } else {
            fundingFee = 1;
        }
        fundingFee *= TokenHelper.convertIndexAmountToStable(
            pair,
            int256((position.positionAmount * fundingFeeTracker.abs()) / PrecisionUtils.fundingRatePrecision()));
    }

    function getCurrentFundingRate(uint256 _pairIndex) external view override returns (int256) {
        return currentFundingRate[_pairIndex];
    }

    function getNextFundingRate(uint256 _pairIndex) external view override returns (int256) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        uint256 price = IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        return _nextFundingRate(_pairIndex, price);
    }

    function getNextFundingRateUpdateTime(
        uint256 _pairIndex
    ) external view override returns (uint256) {
        return
            lastFundingRateUpdateTimes[_pairIndex] +
            IFundingRate(ADDRESS_PROVIDER.fundingRate()).getFundingInterval(_pairIndex);
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool need, uint256 needADLAmount) {
        IPool.Vault memory vault = pool.getVault(pairIndex);
        int256 exposedPositions = this.getExposedPositions(pairIndex);

        int256 available;
        if (isLong) {
            available =
                (int256(vault.stableTotalAmount) * int256(PrecisionUtils.pricePrecision())) /
                int256(executionPrice) +
                exposedPositions;
        } else {
            available = int256(vault.indexTotalAmount) - exposedPositions;
        }

        if (available <= 0) {
            return (true, executionSize);
        }

        if (executionSize > available.abs()) {
            need = true;
            needADLAmount = executionSize - available.abs();
        }
        return (need, needADLAmount);
    }

    function getExposedPositions(uint256 _pairIndex) public view override returns (int256) {
        if (longTracker[_pairIndex] > shortTracker[_pairIndex]) {
            return int256(longTracker[_pairIndex] - shortTracker[_pairIndex]);
        } else {
            return -int256(shortTracker[_pairIndex] - longTracker[_pairIndex]);
        }
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

    function getPositionKey(
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) public pure returns (bytes32) {
        return PositionKey.getPositionKey(_account, _pairIndex, _isLong);
    }
}
