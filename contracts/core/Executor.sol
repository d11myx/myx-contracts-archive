// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
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

contract Executor is IExecutor, Pausable {
    using SafeERC20 for IERC20;
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
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isAdmin(msg.sender), 'onlyAdmin');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isKeeper(msg.sender), 'onlyPositionKeeper');
        _;
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
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseMarketOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeDecreaseMarketOrders(decreaseOrders);
    }

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory increaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseLimitOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external override onlyPositionKeeper whenNotPaused {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeDecreaseLimitOrders(decreaseOrders);
    }

    function executeIncreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            console.log('==> executeIncreaseMarketOrders orderId:', order.orderId);

            try
                this.executeIncreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    order.level,
                    order.commissionRatio
                )
            {
                console.log('== completed. orderId:', order.orderId);
            } catch Error(string memory reason) {
                console.log('== error:', reason);
                orderManager.cancelOrder(order.orderId, TradingTypes.TradeType.MARKET, true);
                console.log('== canceled:', order.orderId);
            }
        }
    }

    function executeIncreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            console.log('==> executeIncreaseLimitOrders orderId:', order.orderId);

            try
                this.executeIncreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.LIMIT,
                    order.level,
                    order.commissionRatio
                )
            {
                console.log('== completed. orderId:', order.orderId);
            } catch Error(string memory reason) {
                console.log('== error:', reason);
            }
        }
    }

    function executeIncreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external override onlyPositionKeeper whenNotPaused {
        console.log('==> executeIncreaseOrder orderId:', _orderId);

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
            orderManager.cancelOrder(order.orderId, order.tradeType, true);
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        // validate can be triggered
        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);
        bool isAbove = order.isLong &&
            (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT);
        ValidationHelper.validatePriceTriggered(tradingConfig, order.tradeType, isAbove, price, order.openPrice);

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
            // tradingConfig.minLeverage,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );
        require(afterPosition > 0, 'zero position amount');

        IPool.Vault memory lpVault = pool.getVault(pairIndex);

        int256 preNetExposureAmountChecker = positionManager.getExposedPositions(order.pairIndex);
        if (preNetExposureAmountChecker >= 0) {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= availableIndex, 'lp index token not enough');
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(
                    order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price),
                    'lp stable token not enough'
                );
            }
        } else {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(
                    order.sizeAmount <= uint256(-preNetExposureAmountChecker) + availableIndex,
                    'lp index token not enough'
                );
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), 'lp stable token not enough');
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

        bytes32 orderKey = PositionKey.getOrderKey(true, order.tradeType, _orderId);
        TradingTypes.OrderWithTpSl memory orderTpSl = orderManager.getOrderTpSl(orderKey);
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
                    data: abi.encode(order.account)
                })
            );
        }

        orderManager.removeOrderTpSl(orderKey);

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
        console.log('<== executeIncreaseOrder orderId:', _orderId);
    }

    function executeDecreaseMarketOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            console.log('==> executeDecreaseMarketOrders orderId:', order.orderId);

            try
                this.executeDecreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.MARKET,
                    order.level,
                    order.commissionRatio
                )
            {
                console.log('== completed. orderId:', order.orderId);
            } catch Error(string memory reason) {
                console.log('== error:', reason);
                orderManager.cancelOrder(order.orderId, TradingTypes.TradeType.MARKET, false);
                console.log('== canceled:', order.orderId);
            }
        }
    }

    function executeDecreaseLimitOrders(
        ExecuteOrder[] memory orders
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < orders.length; i++) {
            ExecuteOrder memory order = orders[i];
            console.log('==> executeDecreaseLimitOrders orderId:', order.orderId);

            try
                this.executeDecreaseOrder(
                    order.orderId,
                    TradingTypes.TradeType.LIMIT,
                    order.level,
                    order.commissionRatio
                )
            {
                console.log('== completed. index:', order.orderId);
            } catch Error(string memory reason) {
                console.log('== error:', reason);
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
        console.log('==> executeDecreaseOrder orderId:', _orderId);

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
            orderManager.cancelOrder(order.orderId, order.tradeType, false);
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
            order.triggerPrice
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
            orderManager.setPositionHasTpSl(key, order.tradeType, false);
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
                    orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
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
        console.log('<== executeDecreaseOrder orderId:', _orderId);
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
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

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
        require(order.needADL, 'no need ADL');

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(order.pairIndex);

        ExecutePositionInfo[] memory adlPositions = new ExecutePositionInfo[](executePositions.length);
        uint256 executeTotalAmount;
        for (uint256 i = 0; i < adlPositions.length; i++) {
            ExecutePosition memory executePosition = executePositions[i];

            Position.Info memory position = positionManager.getPositionByKey(executePosition.positionKey);
            require(executePosition.sizeAmount <= position.positionAmount, 'ADL size exceeds position');
            require(executePosition.sizeAmount <= tradingConfig.maxTradeAmount, 'exceeds max trade amount');
            executeTotalAmount += executePosition.sizeAmount;

            ExecutePositionInfo memory adlPosition = adlPositions[i];
            adlPosition.position = position;
            adlPosition.level = executePosition.level;
            adlPosition.commissionRatio = executePosition.commissionRatio;
        }
        require(executeTotalAmount == order.sizeAmount, 'ADL position amount not match decrease order');

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
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.liquidatePositions(executePositions);
    }

    function liquidatePositions(
        ExecutePosition[] memory executePositions
    ) external override onlyPositionKeeper whenNotPaused {
        for (uint256 i = 0; i < executePositions.length; i++) {
            ExecutePosition memory executePosition = executePositions[i];
            _liquidatePosition(executePosition.positionKey, executePosition.level, executePosition.commissionRatio);
        }
    }

    function _liquidatePosition(bytes32 positionKey, uint8 level, uint256 commissionRatio) internal {
        Position.Info memory position = positionManager.getPositionByKey(positionKey);
        if (position.positionAmount == 0) {
            return;
        }
        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);
        uint256 price = TradingHelper.getValidPrice(ADDRESS_PROVIDER, pair.indexToken, tradingConfig);

        int256 unrealizedPnl = position.getUnrealizedPnl(position.positionAmount, price);
        uint256 tradingFee = positionManager.getTradingFee(
            position.pairIndex,
            position.isLong,
            position.positionAmount
        );
        int256 fundingFee = positionManager.getFundingFee(position.account, position.pairIndex, position.isLong);
        int256 exposureAsset = int256(position.collateral) +
            unrealizedPnl -
            int256(tradingFee) +
            (position.isLong ? -fundingFee : fundingFee);

        bool needLiquidate;
        if (exposureAsset <= 0) {
            needLiquidate = true;
        } else {
            uint256 riskRate = position
                .positionAmount
                .mulPrice(position.averagePrice)
                .mulPercentage(tradingConfig.maintainMarginRate)
                .calculatePercentage(uint256(exposureAsset));
            needLiquidate = riskRate >= PrecisionUtils.percentage();
        }
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
                data: abi.encode(position.account)
            })
        );

        this.executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET, level, commissionRatio);

        emit ExecuteLiquidation(
            positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.collateral,
            position.positionAmount,
            price
        );
    }

    function setPaused() external onlyAdmin {
        _pause();
    }

    function setUnPaused() external onlyAdmin {
        _unpause();
    }
}
