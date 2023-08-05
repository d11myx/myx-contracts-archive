// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/type/TradingTypes.sol";

interface IRouter {

    event UpdateTradingRouter(address oldAddress, address newAddress);

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory request) external returns (uint256);

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory request) external returns (uint256);

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelAllPositionOrders(uint256 pairIndex, bool isLong) external;

    function cancelOrders(uint256 pairIndex, bool isLong, bool isIncrease) external;

    function createTpSl(TradingTypes.CreateTpSlRequest memory request) external returns (uint256 tpOrderId, uint256 slOrderId);

}
