// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";

import "../libraries/PositionKey.sol";
import "../libraries/ETHGateway.sol";
import "../libraries/Multicall.sol";
import "../interfaces/IRouter.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/ILiquidityCallback.sol";
import "../interfaces/ISwapCallback.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IOrderCallback.sol";

contract Router is Multicall, IRouter, ILiquidityCallback, IOrderCallback, ETHGateway {
    IAddressesProvider public immutable ADDRESS_PROVIDER;
    IOrderManager public immutable orderManager;
    IPool public immutable pool;

    constructor(
        address _weth,
        IAddressesProvider addressProvider,
        IOrderManager _orderManager,
        IPool _pool
    ) ETHGateway(_weth) {
        ADDRESS_PROVIDER = addressProvider;
        orderManager = _orderManager;
        pool = _pool;
    }

    modifier onlyPoolAdmin() {
        require(
            IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender),
            "onlyPoolAdmin"
        );
        _;
    }

    modifier onlyOrderManager() {
        require(msg.sender == address(orderManager), "onlyOrderManager");
        _;
    }

    modifier onlyPool() {
        require(msg.sender == address(pool), "onlyPool");
        _;
    }

    function createIncreaseOrder(
        TradingTypes.IncreasePositionWithTpSlRequest memory request
    ) external returns (uint256 orderId) {
        request.account = msg.sender;

        require(
            request.tradeType != TradingTypes.TradeType.TP &&
                request.tradeType != TradingTypes.TradeType.SL,
            "not support"
        );

        orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: request.account,
                pairIndex: request.pairIndex,
                tradeType: request.tradeType,
                collateral: request.collateral,
                openPrice: request.openPrice,
                isLong: request.isLong,
                sizeAmount: int256(request.sizeAmount),
                maxSlippage: request.maxSlippage,
                data: abi.encode(request.account)
            })
        );

        // order with tp sl
        if (request.tp > 0 || request.sl > 0) {
            orderManager.saveOrderTpSl(
                orderId,
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

    function createIncreaseOrderWithoutTpSl(
        TradingTypes.IncreasePositionRequest memory request
    ) external returns (uint256 orderId) {
        request.account = msg.sender;

        require(
            request.tradeType != TradingTypes.TradeType.TP &&
                request.tradeType != TradingTypes.TradeType.SL,
            "not support"
        );

        return
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: request.account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.openPrice,
                    isLong: request.isLong,
                    sizeAmount: int256(request.sizeAmount),
                    maxSlippage: request.maxSlippage,
                    data: abi.encode(request.account)
                })
            );
    }

    function createDecreaseOrder(
        TradingTypes.DecreasePositionRequest memory request
    ) external returns (uint256) {
        request.account = msg.sender;

        return
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: request.account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.triggerPrice,
                    isLong: request.isLong,
                    sizeAmount: -int256(request.sizeAmount),
                    maxSlippage: request.maxSlippage,
                    data: abi.encode(request.account)
                })
            );
    }

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external {
        orderManager.cancelOrder(orderId, tradeType, true, "cancelIncreaseOrder");
    }

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external {
        orderManager.cancelOrder(orderId, tradeType, false, "cancelDecreaseOrder");
    }

    function cancelOrders(uint256 pairIndex, bool isLong, bool isIncrease) external {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

        for (uint256 i = 0; i < orders.length; i++) {
            IOrderManager.PositionOrder memory positionOrder = orders[i];
            if (isIncrease && positionOrder.isIncrease) {
                orderManager.cancelOrder(
                    positionOrder.orderId,
                    positionOrder.tradeType,
                    true,
                    "cancelOrders"
                );
            } else if (!isIncrease && !positionOrder.isIncrease) {
                orderManager.cancelOrder(
                    positionOrder.orderId,
                    positionOrder.tradeType,
                    false,
                    "cancelOrders"
                );
            }
        }
    }

    function createOrderTpSl(
        CreateOrderTpSlRequest memory request
    ) external returns (uint256 tpOrderId, uint256 slOrderId) {
        uint256 orderAmount;
        if (request.isIncrease) {
            TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(
                request.orderId,
                request.tradeType
            );
            require(order.account == msg.sender, "no access");
            orderAmount = order.sizeAmount;
        } else {
            TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
                request.orderId,
                request.tradeType
            );
            require(order.account == msg.sender, "no access");
            orderAmount = order.sizeAmount;
        }

        if (request.tp > 0 || request.sl > 0) {
            require(request.tp <= orderAmount && request.sl <= orderAmount, "exceeds order size");
            orderManager.saveOrderTpSl(
                request.orderId,
                TradingTypes.OrderWithTpSl({
                    tpPrice: request.tpPrice,
                    tp: request.tp,
                    slPrice: request.slPrice,
                    sl: request.sl
                })
            );
        }
        return (tpOrderId, slOrderId);
    }

    function createTpSl(
        TradingTypes.CreateTpSlRequest memory request
    ) external returns (uint256 tpOrderId, uint256 slOrderId) {
        if (request.tp > 0) {
            tpOrderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: msg.sender,
                    pairIndex: request.pairIndex,
                    tradeType: TradingTypes.TradeType.TP,
                    collateral: 0,
                    openPrice: request.tpPrice,
                    isLong: request.isLong,
                    sizeAmount: -int256(request.tp),
                    maxSlippage: 0,
                    data: abi.encode(msg.sender)
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
                    sizeAmount: -int256(request.sl),
                    maxSlippage: 0,
                    data: abi.encode(msg.sender)
                })
            );
        }
        return (tpOrderId, slOrderId);
    }

    function addLiquidity(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount
    ) external override returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return
            IPool(pool).addLiquidity(
                msg.sender,
                pairIndex,
                indexAmount,
                stableAmount,
                abi.encode(msg.sender)
            );
    }

    function addLiquidityForAccount(
        address indexToken,
        address stableToken,
        address receiver,
        uint256 indexAmount,
        uint256 stableAmount
    ) external override {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        IPool(pool).addLiquidity(
            receiver,
            pairIndex,
            indexAmount,
            stableAmount,
            abi.encode(msg.sender)
        );
    }

    function removeLiquidity(
        address indexToken,
        address stableToken,
        uint256 amount
    )
        external
        override
        returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount)
    {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).removeLiquidity(msg.sender, pairIndex, amount, abi.encode(msg.sender));
    }

    function removeLiquidityForAccount(
        address indexToken,
        address stableToken,
        address receiver,
        uint256 amount
    )
        external
        override
        returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount)
    {
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return IPool(pool).removeLiquidity(receiver, pairIndex, amount, abi.encode(msg.sender));
    }

    function createOrderCallback(
        address collateral,
        uint256 amount,
        address to,
        bytes calldata data
    ) external override onlyOrderManager {
        address sender = abi.decode(data, (address));

        if (amount > 0) {
            IERC20(collateral).transferFrom(sender, to, uint256(amount));
        }
    }

    function addLiquidityCallback(
        address indexToken,
        address stableToken,
        uint256 amountIndex,
        uint256 amountStable,
        bytes calldata data
    ) external override onlyPool {
        address sender = abi.decode(data, (address));

        if (amountIndex > 0) {
            IERC20(indexToken).transferFrom(sender, msg.sender, uint256(amountIndex));
        }
        if (amountStable > 0) {
            IERC20(stableToken).transferFrom(sender, msg.sender, uint256(amountStable));
        }
    }

    function removeLiquidityCallback(
        address pairToken,
        uint256 amount,
        bytes calldata data
    ) external override onlyPool {
        address sender = abi.decode(data, (address));
        IERC20(pairToken).transferFrom(sender, msg.sender, amount);
    }
}
