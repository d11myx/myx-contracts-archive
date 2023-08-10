// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../libraries/Position.sol';
import '../interfaces/IExecutor.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IOrderManager.sol';
import '../interfaces/IPositionManager.sol';
import '../interfaces/IIndexPriceFeed.sol';
import '../pair/interfaces/IPairInfo.sol';
import '../pair/interfaces/IPairVault.sol';
import '../interfaces/IPositionManager.sol';
import '../interfaces/IOraclePriceFeed.sol';

contract Executor is IExecutor {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for Position.Info;

    uint256 public override increaseMarketOrderStartIndex;
    uint256 public override decreaseMarketOrderStartIndex;

    uint256 public override maxTimeDelay;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IOrderManager public orderManager;
    IPairInfo public pairInfo;
    IPairVault public pairVault;
    IPositionManager public positionManager;

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IOrderManager _orderManager,
        IPositionManager _tradingVault,
        uint256 _maxTimeDelay
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        orderManager = _orderManager;
        positionManager = _tradingVault;
        maxTimeDelay = _maxTimeDelay;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isKeeper(msg.sender), 'onlyPositionKeeper');
        _;
    }

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external override onlyPoolAdmin {
        uint256 oldDelay = maxTimeDelay;
        maxTimeDelay = newMaxTimeDelay;
        emit UpdateMaxTimeDelay(oldDelay, newMaxTimeDelay);
    }

    function setPricesAndExecuteMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256 increaseEndIndex,
        uint256 decreaseEndIndex
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseMarketOrders(increaseEndIndex);
        this.executeDecreaseMarketOrders(decreaseEndIndex);
    }

    function setPricesAndExecuteLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256[] memory increaseOrderIds,
        uint256[] memory decreaseOrderIds
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseLimitOrders(increaseOrderIds);
        this.executeDecreaseLimitOrders(decreaseOrderIds);
    }

    function executeIncreaseMarketOrders(uint256 endIndex) external onlyPositionKeeper {
        uint256 index = increaseMarketOrderStartIndex;
        uint256 length = orderManager.increaseMarketOrdersIndex();

        if (index >= length) {
            return;
        }
        if (endIndex > length) {
            endIndex = length;
        }

        while (index < endIndex) {
            try this.executeIncreaseOrder(index, TradingTypes.TradeType.MARKET) {} catch Error(string memory reason) {
                orderManager.cancelOrder(index, TradingTypes.TradeType.MARKET, true);
            }
            index++;
        }
    }

    function executeIncreaseLimitOrders(uint256[] memory orderIds) external onlyPositionKeeper {
        for (uint256 i = 0; i < orderIds.length; i++) {
            try this.executeIncreaseOrder(orderIds[i], TradingTypes.TradeType.LIMIT) {} catch Error(
                string memory reason
            ) {}
        }
    }

    function executeIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external onlyPositionKeeper {
        TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }

        // expire
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            require(order.blockTime + maxTimeDelay >= block.timestamp, 'order expired');
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        require(pair.enable, 'trade pair not supported');

        // check account enable
        require(!positionManager.isFrozen(order.account), 'account is frozen');

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        require(
            order.sizeAmount == 0 ||
                (order.sizeAmount >= tradingConfig.minTradeAmount && order.sizeAmount <= tradingConfig.maxTradeAmount),
            'invalid trade size'
        );

        // check price
        // IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        uint256 price = positionManager.getValidPrice(pair.indexToken, pairIndex, order.isLong);
        if (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT) {
            require(
                order.isLong
                    ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <=
                        order.openPrice
                    : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >=
                        order.openPrice,
                'not reach trigger price'
            );
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, 'not reach trigger price');
        }

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

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);

        // check position and leverage
        (uint256 afterPosition, ) = position.validLeverage(
            price,
            order.collateral,
            order.sizeAmount,
            true,
            tradingConfig.minLeverage,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );
        require(afterPosition > 0, 'zero position amount');

        // check tp sl
        require(
            order.tp == 0 || !orderManager.positionHasTpSl(position.key, TradingTypes.TradeType.TP),
            'tp already exists'
        );
        require(
            order.sl == 0 || !orderManager.positionHasTpSl(position.key, TradingTypes.TradeType.SL),
            'sl already exists'
        );

        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = positionManager.netExposureAmountChecker(order.pairIndex);
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

        // transfer collateral
        if (order.collateral > 0) {
            positionManager.transferTokenTo(pair.stableToken, address(positionManager), order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee) = positionManager.increasePosition(
            order.account,
            pairIndex,
            order.collateral,
            order.sizeAmount,
            order.isLong,
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

        if (order.tp > 0) {
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: order.account,
                    pairIndex: order.pairIndex,
                    tradeType: TradingTypes.TradeType.TP,
                    collateral: 0,
                    openPrice: order.tpPrice,
                    isLong: order.isLong,
                    sizeAmount: -int256(order.tp),
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
                })
            );
        }
        if (order.sl > 0) {
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: order.account,
                    pairIndex: order.pairIndex,
                    tradeType: TradingTypes.TradeType.SL,
                    collateral: 0,
                    openPrice: order.slPrice,
                    isLong: order.isLong,
                    sizeAmount: -int256(order.sl),
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
                })
            );
        }

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
            order.collateral,
            order.isLong,
            order.sizeAmount,
            price,
            tradingFee,
            fundingFee
        );
    }

    function executeDecreaseMarketOrders(uint256 endIndex) external onlyPositionKeeper {
        uint256 index = decreaseMarketOrderStartIndex;
        uint256 length = orderManager.decreaseMarketOrdersIndex();
        if (index >= length) {
            return;
        }
        if (endIndex > length) {
            endIndex = length;
        }

        while (index < endIndex) {
            try this.executeDecreaseOrder(index, TradingTypes.TradeType.MARKET) {} catch Error(string memory reason) {
                orderManager.cancelOrder(index, TradingTypes.TradeType.MARKET, false);
            }
            index++;
        }
    }

    function executeDecreaseLimitOrders(uint256[] memory orderIds) external onlyPositionKeeper {
        for (uint256 i = 0; i < orderIds.length; i++) {
            try this.executeDecreaseOrder(orderIds[i], TradingTypes.TradeType.LIMIT) {} catch Error(
                string memory reason
            ) {}
        }
    }

    function executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external onlyPositionKeeper {
        _executeDecreaseOrder(_orderId, _tradeType);
    }

    function _executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) internal {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }

        // expire
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            require(order.blockTime + maxTimeDelay >= block.timestamp, 'order expired');
        }

        // get pair
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);

        // get position
        Position.Info memory position = positionManager.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            return;
        }

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);

        order.sizeAmount = order.sizeAmount.min(position.positionAmount);
        require(
            order.sizeAmount == 0 ||
                (order.sizeAmount >= tradingConfig.minTradeAmount && order.sizeAmount <= tradingConfig.maxTradeAmount),
            'invalid trade size'
        );
        // IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        // check price
        uint256 price = positionManager.getValidPrice(pair.indexToken, pairIndex, order.isLong);
        if (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT) {
            require(
                order.abovePrice
                    ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <=
                        order.triggerPrice
                    : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >=
                        order.triggerPrice,
                'not reach trigger price'
            );
        } else {
            require(
                order.abovePrice ? price <= order.triggerPrice : price >= order.triggerPrice,
                'not reach trigger price'
            );
        }

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (!order.isLong) {
                price = order.triggerPrice.min(price);
            } else {
                price = order.triggerPrice.max(price);
            }
        }

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);

        // check position and leverage
        position.validLeverage(
            price,
            order.collateral,
            order.sizeAmount,
            false,
            tradingConfig.minLeverage,
            tradingConfig.maxLeverage,
            tradingConfig.maxPositionAmount
        );

        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = positionManager.netExposureAmountChecker(order.pairIndex);
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
                order.sizeAmount,
                price,
                0,
                needADL,
                0,
                0
            );
            return;
        }

        // transfer collateral
        if (order.collateral > 0) {
            IPairInfo.Pair memory pair = pairInfo.getPair(position.pairIndex);
            positionManager.transferTokenTo(pair.stableToken, address(pairVault), order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee, int256 pnl) = positionManager.decreasePosition(
            order.account,
            pairIndex,
            order.collateral,
            order.sizeAmount,
            order.isLong,
            price
        );

        // delete order
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            orderManager.removeDecreaseMarketOrders(_orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            orderManager.removeDecreaseLimitOrders(_orderId);
        } else {
            orderManager.setPositionHasTpSl(position.key, order.tradeType, false);
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
            bytes32 key = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);
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
            order.sizeAmount,
            price,
            pnl,
            needADL,
            tradingFee,
            fundingFee
        );
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.liquidatePositions(positionKeys);
    }

    function liquidatePositions(bytes32[] memory positionKeys) external onlyPositionKeeper {
        for (uint256 i = 0; i < positionKeys.length; i++) {
            _liquidatePosition(positionKeys[i]);
        }
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys,
        uint256[] memory sizeAmounts,
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'invalid params');

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeADLAndDecreaseOrder(positionKeys, sizeAmounts, orderId, tradeType);
    }

    function executeADLAndDecreaseOrder(
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType
    ) public onlyPositionKeeper {
        require(_positionKeys.length == _sizeAmounts.length, 'length not match');

        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);
        require(order.needADL, 'no need ADL');

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(order.pairIndex);

        Position.Info[] memory adlPositions = new Position.Info[](_positionKeys.length);
        uint256 sumAmount;
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            Position.Info memory position = positionManager.getPositionByKey(_positionKeys[i]);
            require(_sizeAmounts[i] <= position.positionAmount, 'ADL size exceeds position');
            require(_sizeAmounts[i] <= tradingConfig.maxTradeAmount, 'exceeds max trade amount');
            sumAmount += _sizeAmounts[i];
            adlPositions[i] = position;
        }

        require(sumAmount == order.sizeAmount, 'ADL position amount not match decrease order');
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);
        uint256 price = positionManager.getValidPrice(pair.indexToken, order.pairIndex, !order.isLong);

        for (uint256 i = 0; i < adlPositions.length; i++) {
            Position.Info memory adlPosition = adlPositions[i];
            uint256 orderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: adlPosition.account,
                    pairIndex: adlPosition.pairIndex,
                    tradeType: TradingTypes.TradeType.MARKET,
                    collateral: 0,
                    openPrice: price,
                    isLong: adlPosition.isLong,
                    sizeAmount: -int256(adlPosition.positionAmount),
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
                })
            );
            _executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);
        }
        _executeDecreaseOrder(_orderId, order.tradeType);
    }

    function _liquidatePosition(bytes32 _positionKey) internal {
        Position.Info memory position = positionManager.getPositionByKey(_positionKey);

        if (position.positionAmount == 0) {
            return;
        }
        IPairInfo.Pair memory pair = pairInfo.getPair(position.pairIndex);
        uint256 price = positionManager.getValidPrice(pair.indexToken, position.pairIndex, position.isLong);

        int256 unrealizedPnl = position.getUnrealizedPnl(position.positionAmount, price);
        int256 exposureAsset = int256(position.collateral) + unrealizedPnl;

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);

        bool needLiquidate;
        if (exposureAsset <= 0) {
            needLiquidate = true;
        } else {
            uint256 riskRate = position.positionAmount.mulPrice(position.averagePrice)
                .mulPercentage(tradingConfig.maintainMarginRate)
                .calculatePercentage(uint256(exposureAsset));
            needLiquidate = riskRate >= PrecisionUtils.oneHundredPercentage();
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
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            })
        );

        _executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);

        emit LiquidatePosition(
            _positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.positionAmount,
            position.collateral,
            price,
            orderId
        );
    }


}
