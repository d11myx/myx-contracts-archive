// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/utils/Address.sol';

import '../libraries/PositionKey.sol';
import '../libraries/ETHGateway.sol';
import '../libraries/Multicall.sol';
import '../interfaces/IRouter.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IOrderManager.sol';
import '../interfaces/ILiquidityCallback.sol';
import '../interfaces/ISwapCallback.sol';
import '../interfaces/IPool.sol';

contract Router is Multicall, IRouter, ILiquidityCallback, ISwapCallback, ETHGateway {
    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IOrderManager public orderManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    constructor(address _weth, IAddressesProvider addressProvider, IOrderManager _orderManager) ETHGateway(_weth) {
        ADDRESS_PROVIDER = addressProvider;
        orderManager = _orderManager;
    }

    function createIncreaseOrder(TradingTypes.IncreasePositionWithTpSlRequest memory request) external returns (uint256 orderId) {
        request.account = msg.sender;

        require(request.tradeType != TradingTypes.TradeType.TP && request.tradeType != TradingTypes.TradeType.SL, 'not support');

        orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: request.account,
                pairIndex: request.pairIndex,
                tradeType: request.tradeType,
                collateral: request.collateral,
                openPrice: request.openPrice,
                isLong: request.isLong,
                sizeAmount: int256(request.sizeAmount)
            })
        );

        // order with tp sl
        if (request.tp > 0 || request.sl > 0) {
            bytes32 positionKey = PositionKey.getPositionKey(request.account, request.pairIndex, request.isLong);

            require(
                request.tp == 0 || !orderManager.positionHasTpSl(positionKey, TradingTypes.TradeType.TP),
                'tp already exists'
            );
            require(
                request.sl == 0 || !orderManager.positionHasTpSl(positionKey, TradingTypes.TradeType.SL),
                'sl already exists'
            );

            bytes32 orderKey = PositionKey.getOrderKey(true, request.tradeType, orderId);

            orderManager.saveOrderTpSl(
                orderKey,
                TradingTypes.OrderWithTpSl({
                    tpPrice: request.tpPrice,
                    tp: request.tp,
                    slPrice: request.slPrice,
                    sl: request.sl
                })
            );
        }
        return orderId;
    }

    function createIncreaseOrderWithoutTpSl(TradingTypes.IncreasePositionRequest memory request) external returns (uint256 orderId) {
        request.account = msg.sender;

        require(request.tradeType != TradingTypes.TradeType.TP && request.tradeType != TradingTypes.TradeType.SL, 'not support');

        return orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: request.account,
                pairIndex: request.pairIndex,
                tradeType: request.tradeType,
                collateral: request.collateral,
                openPrice: request.openPrice,
                isLong: request.isLong,
                sizeAmount: int256(request.sizeAmount)
            })
        );
    }

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory request) external returns (uint256) {
        request.account = msg.sender;

        return orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: request.account,
                pairIndex: request.pairIndex,
                tradeType: request.tradeType,
                collateral: request.collateral,
                openPrice: request.triggerPrice,
                isLong: request.isLong,
                sizeAmount: - int256(request.sizeAmount)
            })
        );
    }

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external {
        orderManager.cancelOrder(orderId, tradeType, true);
    }

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external {
        orderManager.cancelOrder(orderId, tradeType, false);
    }

    function cancelAllPositionOrders(uint256 pairIndex, bool isLong) external {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

        while (orders.length > 0) {
            uint256 lastIndex = orders.length - 1;
            IOrderManager.PositionOrder memory positionOrder = orders[lastIndex];
            if (positionOrder.isIncrease) {
                orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, true);
            } else {
                orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
            }
        }
    }

    function cancelOrders(uint256 pairIndex, bool isLong, bool isIncrease) external {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

        for (uint256 i = 0; i < orders.length; i++) {
            IOrderManager.PositionOrder memory positionOrder = orders[i];
            if (isIncrease && positionOrder.isIncrease) {
                orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, true);
            } else if (!isIncrease && !positionOrder.isIncrease) {
                orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
            }
        }
    }

    function createTpSl(
        TradingTypes.CreateTpSlRequest memory request
    ) external returns (uint256 tpOrderId, uint256 slOrderId) {
        bytes32 key = PositionKey.getPositionKey(msg.sender, request.pairIndex, request.isLong);
        require(request.tp == 0 || !orderManager.positionHasTpSl(key, TradingTypes.TradeType.TP), 'tp already exists');
        require(request.sl == 0 || !orderManager.positionHasTpSl(key, TradingTypes.TradeType.SL), 'sl already exists');

        if (request.tp > 0) {
            tpOrderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: msg.sender,
                    pairIndex: request.pairIndex,
                    tradeType: TradingTypes.TradeType.TP,
                    collateral: 0,
                    openPrice: request.tpPrice,
                    isLong: request.isLong,
                    sizeAmount: - int256(request.tp)
                })
            );
        }
        if (request.sl > 0) {
            slOrderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: msg.sender,
                    pairIndex: request.pairIndex,
                    tradeType: TradingTypes.TradeType.SL,
                    collateral: 0,
                    openPrice: request.slPrice,
                    isLong: request.isLong,
                    sizeAmount: - int256(request.sl)
                })
            );
        }
        return (tpOrderId, slOrderId);
    }

    function addLiquidity(
        address pool,
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount
    ) external override {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        IPool(pool).addLiquidity(msg.sender, pairIndex, indexAmount, stableAmount, abi.encode(msg.sender));
    }

    function addLiquidityForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        uint256 indexAmount,
        uint256 stableAmount
    ) external override {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        IPool(pool).addLiquidity(receiver, pairIndex, indexAmount, stableAmount, abi.encode(msg.sender));
    }

    function removeLiquidity(
        address pool,
        address indexToken,
        address stableToken,
        uint256 amount
    ) external override returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).removeLiquidity(msg.sender, pairIndex, amount, abi.encode(msg.sender));
    }

    function removeLiquidityForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        uint256 amount
    ) external override returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).removeLiquidity(receiver, pairIndex, amount, abi.encode(msg.sender));
    }

    function swap(
        address pool,
        address indexToken,
        address stableToken,
        bool isBuy,
        uint256 amountIn,
        uint256 minOut
    ) external override returns (uint256, uint256) {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).swap(pairIndex, isBuy, amountIn, minOut, abi.encode(msg.sender));
    }

    function swapForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        bool isBuy,
        uint256 amountIn,
        uint256 minOut
    ) external override returns (uint256, uint256) {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).swapForAccount(msg.sender, receiver, pairIndex, isBuy, amountIn, minOut, abi.encode(msg.sender));
    }

    function addLiquidityCallback(
        address indexToken,
        address stableToken,
        uint256 amountIndex,
        uint256 amountStable,
        bytes calldata data
    ) external override {
        address sender = abi.decode(data, (address));

        if (amountIndex > 0) {
            IERC20(indexToken).transferFrom(sender, msg.sender, uint256(amountIndex));
        }
        if (amountStable > 0) {
            IERC20(stableToken).transferFrom(sender, msg.sender, uint256(amountStable));
        }
    }

    function removeLiquidityCallback(address pairToken, uint256 amount, bytes calldata data) external override {
        address sender = abi.decode(data, (address));
        IERC20(pairToken).transferFrom(sender, msg.sender, amount);
    }

    function swapCallback(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount,
        bytes calldata data
    ) external override {
        address sender = abi.decode(data, (address));

        if (indexAmount > 0) {
            IERC20(indexToken).transferFrom(sender, msg.sender, indexAmount);
        } else if (stableAmount > 0) {
            IERC20(stableToken).transferFrom(sender, msg.sender, stableAmount);
        }
    }
}
