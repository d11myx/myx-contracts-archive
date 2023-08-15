// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IRouter.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IOrderManager.sol';

import '../libraries/PositionKey.sol';
import '../libraries/ETHGetway.sol';
import '../libraries/Multicall.sol';

contract Router is Multicall, IRouter, ETHGetway {
    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IOrderManager public orderManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    constructor(address _weth, IAddressesProvider addressProvider, IOrderManager _orderManager) ETHGetway(_weth) {
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
}
