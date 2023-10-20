// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../../libraries/Position.sol";
import "../../interfaces/IExecutionLogic.sol";
import "../../interfaces/IAddressesProvider.sol";
import "../../interfaces/IRoleManager.sol";
import "../../interfaces/IOrderManager.sol";
import "../../interfaces/IPositionManager.sol";
import "../../interfaces/IPriceOracle.sol";
import "../../interfaces/IPool.sol";
import "../../helpers/ValidationHelper.sol";
import "../../helpers/TradingHelper.sol";
import "../../interfaces/IFeeCollector.sol";
import "../../interfaces/IExecutor.sol";

contract ExecutionLogic is IExecutionLogic {
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for Position.Info;

    uint256 public override maxTimeDelay;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IPool public immutable pool;
    IOrderManager public immutable orderManager;
    IPositionManager public immutable positionManager;
    address public executor;

    IFeeCollector public immutable feeCollector;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pool,
        IOrderManager _orderManager,
        IPositionManager _positionManager,
        IFeeCollector _feeCollector,
        uint256 _maxTimeDelay
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pool = _pool;
        orderManager = _orderManager;
        positionManager = _positionManager;
        feeCollector = _feeCollector;
        maxTimeDelay = _maxTimeDelay;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), "opa");
        _;
    }

    modifier onlyExecutorOrKeeper() {
        require(
            msg.sender == executor ||
                msg.sender == address(this) ||
                IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(msg.sender),
            "oe"
        );
        _;
    }

    function updateExecutor(address _executor) external override onlyPoolAdmin {
        executor = _executor;
    }

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external override onlyPoolAdmin {
        uint256 oldDelay = maxTimeDelay;
        maxTimeDelay = newMaxTimeDelay;
        emit UpdateMaxTimeDelay(oldDelay, newMaxTimeDelay);
    }

    function executeIncreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyExecutorOrKeeper {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];

            try
                this.executeIncreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    order.level,
                    order.commissionRatio
                )
            {} catch Error(string memory reason) {
                orderManager.cancelOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    true,
                    reason
                );
            }
        }
    }

    function executeIncreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyExecutorOrKeeper {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            try
                this.executeIncreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.LIMIT,
                    order.level,
                    order.commissionRatio
                )
            {} catch Error(string memory reason) {
                emit ExecuteOrderError(order.orderId, reason);
            }
        }
    }

    function executeIncreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external override onlyExecutorOrKeeper {
        TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(
            _orderId,
            _tradeType
        );
        if (order.account == address(0)) {
            return;
        }

        // is expired
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            ValidationHelper.validateOrderExpired(order.blockTime, maxTimeDelay);
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPool.Pair memory pair = pool.getPair(pairIndex);
        if (!pair.enable) {
            orderManager.cancelOrder(order.orderId, order.tradeType, true, "pair enable");
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        // validate can be triggered
        uint256 executionPrice = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );
        bool isAbove = order.isLong &&
            (order.tradeType == TradingTypes.TradeType.MARKET ||
                order.tradeType == TradingTypes.TradeType.LIMIT);
        ValidationHelper.validatePriceTriggered(
            tradingConfig,
            order.tradeType,
            isAbove,
            executionPrice,
            order.openPrice,
            order.maxSlippage
        );

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (order.isLong) {
                executionPrice = Math.min(order.openPrice, executionPrice);
            } else {
                executionPrice = Math.max(order.openPrice, executionPrice);
            }
        }

        IPool.Vault memory lpVault = pool.getVault(pairIndex);
        int256 exposureAmount = positionManager.getExposedPositions(pairIndex);

        uint256 orderSize = order.sizeAmount - order.executedSize;
        uint256 executionSize;
        if (orderSize > 0) {
            (executionSize) = TradingHelper.exposureAmountChecker(
                lpVault,
                exposureAmount,
                order.isLong,
                orderSize,
                executionPrice
            );
            if (executionSize == 0) {
                return;
            }
        }

        int256 collateral;
        if (order.collateral > 0) {
            collateral = order.executedSize == 0 || order.tradeType == TradingTypes.TradeType.MARKET
                ? order.collateral
                : int256(0);
        } else {
            collateral = order.executedSize + executionSize >= order.sizeAmount ||
                order.tradeType == TradingTypes.TradeType.MARKET
                ? order.collateral
                : int256(0);
        }
        // get position
        Position.Info memory position = positionManager.getPosition(
            order.account,
            order.pairIndex,
            order.isLong
        );
        // check position and leverage
        (uint256 afterPosition, ) = position.validLeverage(
            pair,
            executionPrice,
            collateral,
            executionSize,
            true,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );
        require(afterPosition > 0, "zpa");

        // increase position
        (uint256 tradingFee, int256 fundingFee) = positionManager.increasePosition(
            pairIndex,
            order.orderId,
            order.account,
            tx.origin,
            executionSize,
            order.isLong,
            collateral,
            feeCollector.getLevelDiscounts(level),
            commissionRatio,
            executionPrice
        );

        // add executed size
        order.executedSize += executionSize;
        orderManager.increaseOrderExecutedSize(order.orderId, order.tradeType, true, executionSize);

        // create order tp sl
        _createOrderTpSl(order);

        // remove order
        if (
            order.tradeType == TradingTypes.TradeType.MARKET ||
            order.executedSize >= order.sizeAmount
        ) {
            orderManager.removeOrderFromPosition(
                IOrderManager.PositionOrder(
                    order.account,
                    order.pairIndex,
                    order.isLong,
                    true,
                    order.tradeType,
                    _orderId,
                    order.sizeAmount
                )
            );

            // delete order
            if (_tradeType == TradingTypes.TradeType.MARKET) {
                orderManager.removeIncreaseMarketOrders(_orderId);
            } else if (_tradeType == TradingTypes.TradeType.LIMIT) {
                orderManager.removeIncreaseLimitOrders(_orderId);
            }
        }

        emit ExecuteIncreaseOrder(
            order.account,
            order.orderId,
            order.pairIndex,
            order.tradeType,
            order.isLong,
            collateral,
            order.sizeAmount,
            order.openPrice,
            executionSize,
            executionPrice,
            order.executedSize,
            tradingFee,
            fundingFee
        );
    }

    function executeDecreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyExecutorOrKeeper {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            try
                this.executeDecreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    order.level,
                    order.commissionRatio,
                    false,
                    0,
                    true
                )
            {} catch Error(string memory reason) {
                orderManager.cancelOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    false,
                    reason
                );
            }
        }
    }

    function executeDecreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyExecutorOrKeeper {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            try
                this.executeDecreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.LIMIT,
                    order.level,
                    order.commissionRatio,
                    false,
                    0,
                    false
                )
            {} catch Error(string memory reason) {
                emit ExecuteOrderError(order.orderId, reason);
            }
        }
    }

    function executeDecreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio,
        bool isSystem,
        uint256 executionSize,
        bool onlyOnce
    ) external override onlyExecutorOrKeeper {
        _executeDecreaseOrder(
            _orderId,
            _tradeType,
            level,
            commissionRatio,
            isSystem,
            executionSize,
            onlyOnce
        );
    }

    function _executeDecreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio,
        bool isSystem,
        uint256 executionSize,
        bool onlyOnce
    ) internal {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
            _orderId,
            _tradeType
        );
        if (order.account == address(0)) {
            return;
        }

        // is expired
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            ValidationHelper.validateOrderExpired(order.blockTime, maxTimeDelay);
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPool.Pair memory pair = pool.getPair(pairIndex);
        if (!pair.enable) {
            orderManager.cancelOrder(order.orderId, order.tradeType, false, "!enabled");
            return;
        }

        // get position
        Position.Info memory position = positionManager.getPosition(
            order.account,
            order.pairIndex,
            order.isLong
        );
        if (position.positionAmount == 0) {
            orderManager.cancelAllPositionOrders(order.account, order.pairIndex, order.isLong);
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        if (executionSize == 0) {
            executionSize = order.sizeAmount - order.executedSize;
            if (executionSize > tradingConfig.maxTradeAmount && !isSystem) {
                executionSize = tradingConfig.maxTradeAmount;
            }
        }

        // valid order size
        executionSize = Math.min(executionSize, position.positionAmount);

        // validate can be triggered
        uint256 executionPrice = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );
        ValidationHelper.validatePriceTriggered(
            tradingConfig,
            order.tradeType,
            order.abovePrice,
            executionPrice,
            order.triggerPrice,
            order.maxSlippage
        );

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (!order.isLong) {
                executionPrice = Math.min(order.triggerPrice, executionPrice);
            } else {
                executionPrice = Math.max(order.triggerPrice, executionPrice);
            }
        }

        // check position and leverage
        position.validLeverage(
            pair,
            executionPrice,
            order.collateral,
            executionSize,
            false,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );

        (bool _needADL, ) = positionManager.needADL(
            order.pairIndex,
            order.isLong,
            executionSize,
            executionPrice
        );
        if (_needADL) {
            orderManager.setOrderNeedADL(_orderId, order.tradeType, _needADL);

            emit ExecuteDecreaseOrder(
                order.account,
                _orderId,
                pairIndex,
                order.tradeType,
                order.isLong,
                order.collateral,
                order.sizeAmount,
                order.triggerPrice,
                executionSize,
                executionPrice,
                order.executedSize,
                _needADL,
                0,
                0,
                0
            );
            return;
        }

        int256 collateral;
        if (order.collateral > 0) {
            collateral = order.executedSize == 0 || onlyOnce ? order.collateral : int256(0);
        } else {
            collateral = order.executedSize + executionSize >= order.sizeAmount || onlyOnce
                ? order.collateral
                : int256(0);
        }

        (uint256 tradingFee, int256 fundingFee, int256 pnl) = positionManager.decreasePosition(
            pairIndex,
            order.orderId,
            order.account,
            tx.origin,
            executionSize,
            order.isLong,
            collateral,
            feeCollector.getLevelDiscounts(level),
            commissionRatio,
            executionPrice,
            false
        );

        // add executed size
        order.executedSize += executionSize;
        orderManager.increaseOrderExecutedSize(
            order.orderId,
            order.tradeType,
            false,
            executionSize
        );

        position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);

        // remove order
        if (onlyOnce || order.executedSize >= order.sizeAmount || position.positionAmount == 0) {
            // remove decrease order
            orderManager.removeOrderFromPosition(
                IOrderManager.PositionOrder(
                    order.account,
                    order.pairIndex,
                    order.isLong,
                    false,
                    order.tradeType,
                    order.orderId,
                    executionSize
                )
            );

            // delete order
            if (order.tradeType == TradingTypes.TradeType.MARKET) {
                orderManager.removeDecreaseMarketOrders(_orderId);
            } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
                orderManager.removeDecreaseLimitOrders(_orderId);
            } else {
                orderManager.removeDecreaseLimitOrders(_orderId);
            }
        }

        if (position.positionAmount == 0) {
            // cancel all decrease order
            IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(
                PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong)
            );

            for (uint256 i = 0; i < orders.length; i++) {
                IOrderManager.PositionOrder memory positionOrder = orders[i];
                if (!positionOrder.isIncrease) {
                    orderManager.cancelOrder(
                        positionOrder.orderId,
                        positionOrder.tradeType,
                        false,
                        "!increase"
                    );
                }
            }
        }

        emit ExecuteDecreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            order.tradeType,
            order.isLong,
            collateral,
            order.sizeAmount,
            order.triggerPrice,
            executionSize,
            executionPrice,
            order.executedSize,
            _needADL,
            pnl,
            tradingFee,
            fundingFee
        );
    }

    function _createOrderTpSl(TradingTypes.IncreasePositionOrder memory order) internal {
        TradingTypes.OrderWithTpSl memory orderTpSl = orderManager.getOrderTpSl(order.orderId);
        if (orderTpSl.tp > 0) {
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: order.account,
                    pairIndex: order.pairIndex,
                    tradeType: TradingTypes.TradeType.TP,
                    collateral: 0,
                    openPrice: orderTpSl.tpPrice,
                    isLong: order.isLong,
                    sizeAmount: -int256(orderTpSl.tp),
                    maxSlippage: 0,
                    data: abi.encode(order.account)
                })
            );
        }
        if (orderTpSl.sl > 0) {
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: order.account,
                    pairIndex: order.pairIndex,
                    tradeType: TradingTypes.TradeType.SL,
                    collateral: 0,
                    openPrice: orderTpSl.slPrice,
                    isLong: order.isLong,
                    sizeAmount: -int256(orderTpSl.sl),
                    maxSlippage: 0,
                    data: abi.encode(order.account)
                })
            );
        }

        orderManager.removeOrderTpSl(order.orderId);
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) public view returns (bool _needADL) {
        (_needADL, ) = positionManager.needADL(pairIndex, isLong, executionSize, executionPrice);
        return _needADL;
    }

    function executeADLAndDecreaseOrder(
        ExecutePosition[] memory executePositions,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 _level,
        uint256 _commissionRatio
    ) external override onlyExecutorOrKeeper {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
            _orderId,
            _tradeType
        );
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(order.pairIndex);
        IPool.Pair memory pair = pool.getPair(order.pairIndex);

        // execution size
        uint256 executionSize = order.sizeAmount - order.executedSize;

        // execution price
        uint256 executionPrice = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (!order.isLong) {
                executionPrice = Math.min(order.triggerPrice, executionPrice);
            } else {
                executionPrice = Math.max(order.triggerPrice, executionPrice);
            }
        }

        (bool _needADL, uint256 needADLAmount) = positionManager.needADL(
            order.pairIndex,
            order.isLong,
            executionSize,
            executionPrice
        );
        if (!_needADL) {
            this.executeDecreaseOrder(
                order.orderId,
                order.tradeType,
                _level,
                _commissionRatio,
                false,
                0,
                _tradeType == TradingTypes.TradeType.MARKET
            );
            return;
        }

        this.executeDecreaseOrder(
            order.orderId,
            order.tradeType,
            _level,
            _commissionRatio,
            true,
            executionSize - needADLAmount,
            false
        );

        ExecutePositionInfo[] memory adlPositions = new ExecutePositionInfo[](
            executePositions.length
        );
        uint256 executeTotalAmount;
        for (uint256 i = 0; i < adlPositions.length; i++) {
            ExecutePosition memory executePosition = executePositions[i];

            uint256 adlExecutionSize;
            Position.Info memory position = positionManager.getPositionByKey(
                executePosition.positionKey
            );
            if (position.positionAmount >= needADLAmount - executeTotalAmount) {
                adlExecutionSize = needADLAmount - executeTotalAmount;
            } else {
                adlExecutionSize = position.positionAmount;
            }

            if (adlExecutionSize > 0) {
                executeTotalAmount += adlExecutionSize;

                ExecutePositionInfo memory adlPosition = adlPositions[i];
                adlPosition.position = position;
                adlPosition.executionSize = adlExecutionSize;
                adlPosition.level = executePosition.level;
                adlPosition.commissionRatio = executePosition.commissionRatio;
            }
        }
        uint256 price = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );

        for (uint256 i = 0; i < adlPositions.length; i++) {
            ExecutePositionInfo memory adlPosition = adlPositions[i];
            if (adlPosition.executionSize > 0) {
                uint256 orderId = orderManager.createOrder(
                    TradingTypes.CreateOrderRequest({
                        account: adlPosition.position.account,
                        pairIndex: adlPosition.position.pairIndex,
                        tradeType: TradingTypes.TradeType.MARKET,
                        collateral: 0,
                        openPrice: price,
                        isLong: adlPosition.position.isLong,
                        sizeAmount: -int256(adlPosition.executionSize),
                        maxSlippage: 0,
                        data: abi.encode(adlPosition.position.account)
                    })
                );
                this.executeDecreaseOrder(
                    orderId,
                    TradingTypes.TradeType.MARKET,
                    adlPosition.level,
                    adlPosition.commissionRatio,
                    true,
                    0,
                    true
                );
            }
        }
        this.executeDecreaseOrder(
            order.orderId,
            order.tradeType,
            _level,
            _commissionRatio,
            true,
            0,
            false
        );
    }
}
