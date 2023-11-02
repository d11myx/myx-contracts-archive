// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import '../../libraries/Position.sol';
import '../../interfaces/ILiquidationLogic.sol';
import '../../interfaces/IAddressesProvider.sol';
import '../../interfaces/IRoleManager.sol';
import '../../interfaces/IOrderManager.sol';
import '../../interfaces/IPositionManager.sol';
import '../../interfaces/IPool.sol';
import '../../helpers/TradingHelper.sol';
import '../../interfaces/IFeeCollector.sol';

contract LiquidationLogic is ILiquidationLogic {
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for Position.Info;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IPool public immutable pool;
    IOrderManager public immutable orderManager;
    IPositionManager public immutable positionManager;
    IFeeCollector public immutable feeCollector;
    address public executor;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pool,
        IOrderManager _orderManager,
        IPositionManager _positionManager,
        IFeeCollector _feeCollector
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pool = _pool;
        orderManager = _orderManager;
        positionManager = _positionManager;
        feeCollector = _feeCollector;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), 'opa');
        _;
    }

    modifier onlyExecutorOrKeeper() {
        require(msg.sender == executor || msg.sender == address(this) || IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(msg.sender), 'oe');
        _;
    }

    function updateExecutor(address _executor) external override onlyPoolAdmin {
        executor = _executor;
    }

    function liquidatePositions(ExecutePosition[] memory executePositions) external override onlyExecutorOrKeeper {
        for (uint256 i = 0; i < executePositions.length; i++) {
            ExecutePosition memory execute = executePositions[i];
            this.liquidationPosition(execute.positionKey, execute.level, execute.commissionRatio);
        }
    }

    function liquidationPosition(bytes32 positionKey, uint8 level, uint256 commissionRatio) external override onlyExecutorOrKeeper {
        Position.Info memory position = positionManager.getPositionByKey(positionKey);
        if (position.positionAmount == 0) {
            return;
        }
        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);

        bool needLiquidate = _needLiquidation(positionKey, price);
        if (!needLiquidate) {
            return;
        }

        // cancel all positionOrders
        orderManager.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);

        uint256 orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: position.account,
                pairIndex: position.pairIndex,
                tradeType: TradingTypes.TradeType.MARKET,
                collateral: 0,
                openPrice: price,
                isLong: position.isLong,
                sizeAmount: -int256(position.positionAmount),
                maxSlippage: 0,
                data: abi.encode(position.account)
            })
        );

        _executeLiquidationOrder(orderId, level, commissionRatio);

        emit ExecuteLiquidation(
            positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.collateral,
            position.positionAmount,
            price,
            orderId
        );
    }

    function _executeLiquidationOrder(
        uint256 orderId,
        uint8 level,
        uint256 commissionRatio
    ) private {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);
        if (order.account == address(0)) {
            return;
        }

        uint256 pairIndex = order.pairIndex;
        IPool.Pair memory pair = pool.getPair(pairIndex);

        Position.Info memory position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        uint256 executionSize = order.sizeAmount - order.executedSize;
        executionSize = Math.min(executionSize, position.positionAmount);

        uint256 executionPrice = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);

        (bool needADL,) = positionManager.needADL(order.pairIndex, order.isLong, executionSize, executionPrice);
        if (needADL) {
            orderManager.setOrderNeedADL(orderId, order.tradeType, needADL);

            emit ExecuteDecreaseOrder(
                order.account,
                orderId,
                pairIndex,
                order.tradeType,
                order.isLong,
                order.collateral,
                order.sizeAmount,
                order.triggerPrice,
                executionSize,
                executionPrice,
                order.executedSize,
                needADL,
                0,
                0,
                0
            );
            return;
        }

        (uint256 tradingFee, int256 fundingFee, int256 pnl) = positionManager.decreasePosition(
            pairIndex,
            order.orderId,
            order.account,
            tx.origin,
            executionSize,
            order.isLong,
            0,
            feeCollector.getLevelDiscounts(level),
            commissionRatio,
            executionPrice,
            true
        );

        // add executed size
        order.executedSize += executionSize;

        // remove order
        orderManager.cancelAllPositionOrders(order.account, order.pairIndex, order.isLong);
        orderManager.removeDecreaseMarketOrders(orderId);

        emit ExecuteDecreaseOrder(
            order.account,
            orderId,
            pairIndex,
            order.tradeType,
            order.isLong,
            0,
            order.sizeAmount,
            order.triggerPrice,
            executionSize,
            executionPrice,
            order.executedSize,
            needADL,
            pnl,
            tradingFee,
            fundingFee
        );
    }

    function _needLiquidation(bytes32 positionKey, uint256 price) private view returns (bool) {
        Position.Info memory position =  positionManager.getPositionByKey(positionKey);

        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        int256 unrealizedPnl = position.getUnrealizedPnl(pair, position.positionAmount, price);
        uint256 tradingFee = positionManager.getTradingFee(
            position.pairIndex,
            position.isLong,
            position.positionAmount
        );
        int256 fundingFee = positionManager.getFundingFee(position.account, position.pairIndex, position.isLong);
        int256 exposureAsset = int256(position.collateral) + unrealizedPnl - int256(tradingFee) + fundingFee;

        bool need;
        if (exposureAsset <= 0) {
            need = true;
        } else {
            uint256 riskRate = position
                .positionAmount
                .mulPrice(position.averagePrice)
                .mulPercentage(tradingConfig.maintainMarginRate)
                .calculatePercentage(uint256(exposureAsset));
            need = riskRate >= PrecisionUtils.percentage();
        }
        return need;
    }
}
