// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';

import '../interfaces/IRouter.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IOrderManager.sol';

import '../libraries/PositionKey.sol';
import '../libraries/ETHGetway.sol';

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

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory request) external returns (uint256) {
        //TODO decoupling tp sl

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
                    tpPrice: request.tpPrice,
                    tp: request.tp,
                    slPrice: request.slPrice,
                    sl: request.sl
                })
            );
    }

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory request) external returns (uint256) {
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
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
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
                    sizeAmount: -int256(request.tp),
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
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
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
                })
            );
        }
        return (tpOrderId, slOrderId);
    }
}
