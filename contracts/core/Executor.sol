// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import '@openzeppelin/contracts/security/Pausable.sol';

import '../libraries/Position.sol';

import '../interfaces/IExecutor.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IOrderManager.sol';
import '../interfaces/IPositionManager.sol';
import '../interfaces/IIndexPriceFeed.sol';
import '../interfaces/IPool.sol';
import '../helpers/ValidationHelper.sol';
import '../helpers/TradingHelper.sol';
import '../interfaces/IFeeCollector.sol';
import '../helpers/LiquidationLogic.sol';

contract Executor is IExecutor, Pausable {
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for Position.Info;

    uint256 public override maxTimeDelay;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IOrderManager public immutable orderManager;
    IPool public immutable pool;
    IPositionManager public immutable positionManager;
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

    modifier onlyAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isAdmin(msg.sender), 'oa');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), 'opa');
        _;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(msg.sender), 'opk');
        _;
    }

    function setPaused() external onlyAdmin {
        _pause();
    }

    function setUnPaused() external onlyAdmin {
        _unpause();
    }

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external override whenNotPaused onlyPoolAdmin {
        uint256 oldDelay = maxTimeDelay;
        maxTimeDelay = newMaxTimeDelay;
        emit UpdateMaxTimeDelay(oldDelay, newMaxTimeDelay);
    }

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory increaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseMarketOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeDecreaseMarketOrders(decreaseOrders);
    }

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory increaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseLimitOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeDecreaseLimitOrders(decreaseOrders);
    }

    function executeIncreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
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
                orderManager.cancelOrder(order.orderId, TradingTypes.TradeType.MARKET, true, reason);
            }
        }
    }

    function executeIncreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
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
    ) external override onlyPositionKeeper whenNotPaused {
        TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(_orderId, _tradeType);
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
            orderManager.cancelOrder(order.orderId, order.tradeType, true, 'pair enable');
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        // validate can be triggered
        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);
        bool isAbove = order.isLong &&
            (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT);
        ValidationHelper.validatePriceTriggered(tradingConfig, order.tradeType, isAbove, price, order.openPrice, order.maxSlippage);

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (order.isLong) {
                price = order.openPrice.min(price);
            } else {
                price = order.openPrice.max(price);
            }
        }

        // get position
        Position.Info memory position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);

        // check position and leverage
        (uint256 afterPosition, ) = position.validLeverage(
            price,
            order.collateral,
            order.sizeAmount,
            true,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );
        require(afterPosition > 0, 'zpa');

        IPool.Vault memory lpVault = pool.getVault(pairIndex);

        int256 preNetExposureAmountChecker = positionManager.getExposedPositions(order.pairIndex);
        if (preNetExposureAmountChecker >= 0) {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= availableIndex, 'iit');
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(
                    order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price),
                    'ist'
                );
            }
        } else {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= uint256(-preNetExposureAmountChecker) + availableIndex, 'iit');
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), 'ist');
            }
        }

        // increase position
        (uint256 tradingFee, int256 fundingFee) = positionManager.increasePosition(
            pairIndex,
            order.account,
            tx.origin,
            order.sizeAmount,
            order.isLong,
            order.collateral,
            level == 0 ? 0 : feeCollector.levelDiscountRatios(level),
            commissionRatio,
            price
        );

        // create order tp sl
        _createOrderTpSl(order);

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

        emit ExecuteIncreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            _tradeType,
            order.isLong,
            order.collateral,
            order.sizeAmount,
            price,
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

    function executeDecreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            try
                this.executeDecreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    order.level,
                    order.commissionRatio
                )
            {} catch Error(string memory reason) {
                orderManager.cancelOrder(order.orderId, TradingTypes.TradeType.MARKET, false, reason);
            }
        }
    }

    function executeDecreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            try
                this.executeDecreaseOrder(
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

    function executeDecreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external override onlyPositionKeeper whenNotPaused {
        _executeDecreaseOrder(_orderId, _tradeType, level, commissionRatio);
    }

    function _executeDecreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) internal {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);
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
            orderManager.cancelOrder(order.orderId, order.tradeType, false, 'pair enable');
            return;
        }

        // get position
        Position.Info memory position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            orderManager.cancelAllPositionOrders(order.account, order.pairIndex, order.isLong);
            return;
        }

        // calculate valid order size
        order.sizeAmount = Math.min(order.sizeAmount, position.positionAmount);

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        // validate can be triggered
        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);
        ValidationHelper.validatePriceTriggered(
            tradingConfig,
            order.tradeType,
            order.abovePrice,
            price,
            order.triggerPrice,
            order.maxSlippage
        );

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (!order.isLong) {
                price = Math.min(order.triggerPrice, price);
            } else {
                price = Math.max(order.triggerPrice, price);
            }
        }

        // check position and leverage
        position.validLeverage(
            price,
            order.collateral,
            order.sizeAmount,
            false,
            // tradingConfig.minLeverage,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );

        IPool.Vault memory lpVault = pool.getVault(pairIndex);

        int256 preNetExposureAmountChecker = positionManager.getExposedPositions(order.pairIndex);
        bool needADL;
        if (preNetExposureAmountChecker >= 0) {
            if (!order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                needADL = order.sizeAmount > availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                needADL = order.sizeAmount > uint256(preNetExposureAmountChecker) + availableStable.divPrice(price);
            }
        } else {
            if (!order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                needADL = order.sizeAmount > uint256(-preNetExposureAmountChecker) + availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                needADL = order.sizeAmount > availableStable.divPrice(price);
            }
        }

        if (needADL) {
            orderManager.setOrderNeedADL(_orderId, order.tradeType, needADL);

            emit ExecuteDecreaseOrder(
                order.account,
                _orderId,
                pairIndex,
                order.tradeType,
                order.isLong,
                order.collateral,
                order.sizeAmount,
                price,
                needADL,
                0,
                0,
                0
            );
            return;
        }

        (uint256 tradingFee, int256 fundingFee, int256 pnl) = positionManager.decreasePosition(
            pairIndex,
            order.account,
            msg.sender,
            order.sizeAmount,
            order.isLong,
            order.collateral,
            level == 0 ? 0 : feeCollector.levelDiscountRatios(level),
            commissionRatio,
            price
        );

        bytes32 key = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);

        // delete order
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            orderManager.removeDecreaseMarketOrders(_orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            orderManager.removeDecreaseLimitOrders(_orderId);
        } else {
            orderManager.removeDecreaseLimitOrders(_orderId);
        }

        // remove decrease order
        orderManager.removeOrderFromPosition(
            IOrderManager.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            )
        );

        position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);

        if (position.positionAmount == 0) {
            // cancel all decrease order
            IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

            for (uint256 i = 0; i < orders.length; i++) {
                IOrderManager.PositionOrder memory positionOrder = orders[i];
                if (!positionOrder.isIncrease) {
                    orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false, '! increase');
                }
            }
        }

        emit ExecuteDecreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            order.tradeType,
            order.isLong,
            order.collateral,
            order.sizeAmount,
            price,
            needADL,
            pnl,
            tradingFee,
            fundingFee
        );
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeADLAndDecreaseOrder(executePositions, orderId, tradeType, level, commissionRatio);
    }

    function executeADLAndDecreaseOrder(
        ExecutePosition[] memory executePositions,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 _level,
        uint256 _commissionRatio
    ) external override onlyPositionKeeper whenNotPaused {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);
        require(order.needADL, 'noADL');

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(order.pairIndex);

        ExecutePositionInfo[] memory adlPositions = new ExecutePositionInfo[](executePositions.length);
        uint256 executeTotalAmount;
        for (uint256 i = 0; i < adlPositions.length; i++) {
            ExecutePosition memory executePosition = executePositions[i];

            Position.Info memory position = positionManager.getPositionByKey(executePosition.positionKey);
            require(executePosition.sizeAmount <= position.positionAmount, 'ADL sep');
            require(executePosition.sizeAmount <= tradingConfig.maxTradeAmount, 'emta');
            executeTotalAmount += executePosition.sizeAmount;

            ExecutePositionInfo memory adlPosition = adlPositions[i];
            adlPosition.position = position;
            adlPosition.level = executePosition.level;
            adlPosition.commissionRatio = executePosition.commissionRatio;
        }
        require(executeTotalAmount == order.sizeAmount, 'ADL pa');

        IPool.Pair memory pair = pool.getPair(order.pairIndex);
        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);

        for (uint256 i = 0; i < adlPositions.length; i++) {
            ExecutePositionInfo memory adlPosition = adlPositions[i];
            uint256 orderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: adlPosition.position.account,
                    pairIndex: adlPosition.position.pairIndex,
                    tradeType: TradingTypes.TradeType.MARKET,
                    collateral: 0,
                    openPrice: price,
                    isLong: adlPosition.position.isLong,
                    sizeAmount: -int256(adlPosition.position.positionAmount),
                    maxSlippage: 0,
                    data: abi.encode(adlPosition.position.account)
                })
            );
            this.executeDecreaseOrder(
                orderId,
                TradingTypes.TradeType.MARKET,
                adlPosition.level,
                adlPosition.commissionRatio
            );
        }
        this.executeDecreaseOrder(order.orderId, order.tradeType, _level, _commissionRatio);
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecutePosition[] memory executePositions
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.liquidatePositions(executePositions);
    }

    function liquidatePositions(
        ExecutePosition[] memory executePositions
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < executePositions.length; i++) {
            ExecutePosition memory executePosition = executePositions[i];
            LiquidationLogic.liquidationPosition(
                pool,
                orderManager,
                positionManager,
                this,
                ADDRESS_PROVIDER,
                executePosition.positionKey,
                executePosition.level,
                executePosition.commissionRatio
            );
        }
    }
}
