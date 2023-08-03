// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IRouter.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "./interfaces/ITradingRouter.sol";
import "../interfaces/IPositionManager.sol";
import "../libraries/PositionKey.sol";
import "hardhat/console.sol";

contract Router is IRouter, ReentrancyGuardUpgradeable {

    IAddressesProvider public immutable addressProvider;

    ITradingRouter public tradingRouter;
    IPositionManager public positionManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    constructor(IAddressesProvider _addressProvider, ITradingRouter _tradingRouter, IPositionManager _positionManager) {
        addressProvider = _addressProvider;
        tradingRouter = _tradingRouter;
        positionManager = _positionManager;
    }

    function updateTradingRouter(ITradingRouter _tradingRouter) external override onlyPoolAdmin {
        address oldAddress = address(_tradingRouter);
        tradingRouter = _tradingRouter;
        address newAddress = address(tradingRouter);

        emit UpdateTradingRouter(oldAddress, newAddress);
    }

    function increaseMarketOrders(uint256 index) external view override returns (TradingTypes.IncreasePositionOrder memory) {
        return tradingRouter.getIncreaseMarketOrder(index);
    }

    function decreaseMarketOrders(uint256 index) external view override returns (TradingTypes.DecreasePositionOrder memory) {
        return tradingRouter.getDecreaseMarketOrder(index);
    }

    function increaseMarketOrdersIndex() external view override returns (uint256) {
        return tradingRouter.increaseMarketOrdersIndex();
    }

    function decreaseMarketOrdersIndex() external view override returns (uint256) {
        return tradingRouter.decreaseMarketOrdersIndex();
    }

    function increaseMarketOrderStartIndex() external view override returns (uint256) {
        return tradingRouter.increaseMarketOrderStartIndex();
    }

    function decreaseMarketOrderStartIndex() external view override returns (uint256) {
        return tradingRouter.decreaseMarketOrderStartIndex();
    }

    function increaseLimitOrders(uint256 index) external view override returns (TradingTypes.IncreasePositionOrder memory) {
        return tradingRouter.getIncreaseLimitOrder(index);
    }

    function decreaseLimitOrders(uint256 index) external view override returns (TradingTypes.DecreasePositionOrder memory) {
        return tradingRouter.getDecreaseLimitOrder(index);
    }

    function increaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.increaseLimitOrdersIndex();
    }

    function decreaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.decreaseLimitOrdersIndex();
    }

    function positionHasTpSl(bytes32 positionKey, TradingTypes.TradeType tradeType) external view override returns (bool) {
        return tradingRouter.positionHasTpSl(positionKey, tradeType);
    }

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
        //TODO decoupling tp sl

        return positionManager.createOrder(TradingTypes.CreateOrderRequest({
            account: _request.account,
            pairIndex: _request.pairIndex,
            tradeType: _request.tradeType,
            collateral: _request.collateral,
            openPrice: _request.openPrice,
            isLong: _request.isLong,
            sizeAmount: int256(_request.sizeAmount),
            tpPrice: _request.tpPrice,
            tp: _request.tp,
            slPrice: _request.slPrice,
            sl: _request.sl
        }));
    }

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
        return positionManager.createOrder(TradingTypes.CreateOrderRequest({
            account: _request.account,
            pairIndex: _request.pairIndex,
            tradeType: _request.tradeType,
            collateral: _request.collateral,
            openPrice: _request.triggerPrice,
            isLong: _request.isLong,
            sizeAmount: - int256(_request.sizeAmount),
            tpPrice: 0,
            tp: 0,
            slPrice: 0,
            sl: 0
        }));
    }

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external override nonReentrant {
        positionManager.cancelOrder(orderId, tradeType, true);
    }

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external override nonReentrant {
        positionManager.cancelOrder(orderId, tradeType, false);
    }

    function cancelAllPositionOrders(uint256 pairIndex, bool isLong) external override {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        TradingTypes.PositionOrder[] memory orders = tradingRouter.getPositionOrders(key);

        while (orders.length > 0) {
            uint256 lastIndex = orders.length - 1;
            TradingTypes.PositionOrder memory positionOrder = orders[lastIndex];
            console.log("positionOrder lastIndex", lastIndex, "orderId", positionOrder.orderId);
            console.log("positionOrder tradeType", uint8(positionOrder.tradeType), "isIncrease", positionOrder.isIncrease);
            if (positionOrder.isIncrease) {
                positionManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, true);
            } else {
                positionManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
            }
        }
    }

    function cancelOrders(uint256 pairIndex, bool isLong, bool isIncrease) external override {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        TradingTypes.PositionOrder[] memory orders = tradingRouter.getPositionOrders(key);

        for (uint256 i = 0; i < orders.length; i++) {
            TradingTypes.PositionOrder memory positionOrder = orders[i];
            console.log("positionOrder index", i, "orderId", positionOrder.orderId);
            console.log("positionOrder tradeType", uint8(positionOrder.tradeType), "isIncrease", positionOrder.isIncrease);
            if (isIncrease && positionOrder.isIncrease) {
                positionManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, true);
            } else if (!isIncrease && !positionOrder.isIncrease) {
                positionManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
            }
        }
    }

    function createTpSl(TradingTypes.CreateTpSlRequest memory request) external override returns (uint256 tpOrderId, uint256 slOrderId) {
        bytes32 key = PositionKey.getPositionKey(msg.sender, request.pairIndex, request.isLong);
        require(request.tp == 0 || !tradingRouter.positionHasTpSl(key, TradingTypes.TradeType.TP), "tp already exists");
        require(request.sl == 0 || !tradingRouter.positionHasTpSl(key, TradingTypes.TradeType.SL), "sl already exists");

        if (request.tp > 0) {
            tpOrderId = positionManager.createOrder(TradingTypes.CreateOrderRequest({
                account: msg.sender,
                pairIndex: request.pairIndex,
                tradeType: TradingTypes.TradeType.TP,
                collateral: 0,
                openPrice: request.tpPrice,
                isLong: request.isLong,
                sizeAmount: - int256(request.tp),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            }));
        }
        if (request.sl > 0) {
            slOrderId = positionManager.createOrder(TradingTypes.CreateOrderRequest({
                account: msg.sender,
                pairIndex: request.pairIndex,
                tradeType: TradingTypes.TradeType.SL,
                collateral: 0,
                openPrice: request.slPrice,
                isLong: request.isLong,
                sizeAmount: - int256(request.sl),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            }));
        }
        return (tpOrderId, slOrderId);
    }

    function getIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override view returns (TradingTypes.IncreasePositionOrder memory order) {
        return tradingRouter.getIncreaseOrder(_orderId, _tradeType);
    }

    function getDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override view returns (TradingTypes.DecreasePositionOrder memory order) {
        return tradingRouter.getDecreaseOrder(_orderId, _tradeType);
    }

    function getPositionOrders(bytes32 key) external override view returns (TradingTypes.PositionOrder[] memory orders) {
        return tradingRouter.getPositionOrders(key);
    }

}
