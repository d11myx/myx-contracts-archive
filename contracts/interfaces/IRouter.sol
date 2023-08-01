// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../trading/interfaces/ITradingRouter.sol";

interface IRouter {

    event UpdateTradingRouter(address oldAddress, address newAddress);

    function updateTradingRouter(ITradingRouter _tradingRouter) external;

    function increaseMarketOrdersIndex() external returns (uint256);
    function decreaseMarketOrdersIndex() external returns (uint256);
    function increaseMarketOrderStartIndex() external returns (uint256);
    function decreaseMarketOrderStartIndex() external returns (uint256);
    function increaseLimitOrdersIndex() external returns (uint256);
    function decreaseLimitOrdersIndex() external returns (uint256);

    function positionHasTpSl(bytes32 positionKey, TradingTypes.TradeType tradeType) external returns (bool);

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) external returns (uint256 orderId);
    function cancelIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) external returns (uint256 orderId);
    function cancelDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external;
    function cancelOrders(address account, uint256 pairIndex, bool isLong, bool isIncrease) external;

    function createTpSl(TradingTypes.CreateTpSlRequest memory _request) external returns (uint256 tpOrderId, uint256 slOrderId);

    function getIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external view returns (TradingTypes.IncreasePositionOrder memory order);
    function getDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external view returns (TradingTypes.DecreasePositionOrder memory order);

    function getPositionOrders(bytes32 key) external view returns (TradingTypes.PositionOrder[] memory orders);

}
