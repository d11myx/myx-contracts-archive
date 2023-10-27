// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/TradingTypes.sol";

interface IRouter {
    struct AddOrderTpSlRequest {
        uint256 orderId;
        TradingTypes.TradeType tradeType;
        bool isIncrease;
        uint256 tpPrice; // Stop profit price 1e30
        uint256 tp; // The number of profit stops
        uint256 slPrice; // Stop price 1e30
        uint256 sl; // Stop loss quantity
    }

    struct CancelOrderRequest {
        uint256 orderId;
        TradingTypes.TradeType tradeType;
        bool isIncrease;
    }

    event UpdateTradingRouter(address oldAddress, address newAddress);

    // function createIncreaseOrderWithTpSl(
    //     TradingTypes.IncreasePositionWithTpSlRequest memory request
    // ) external returns (uint256 orderId);

    // function createIncreaseOrder(
    //     TradingTypes.IncreasePositionRequest memory request
    // ) external returns (uint256 orderId);

    // function createDecreaseOrder(
    //     TradingTypes.DecreasePositionRequest memory request
    // ) external returns (uint256);

    // function createDecreaseOrders(
    //     TradingTypes.DecreasePositionRequest[] memory requests
    // ) external returns (uint256[] memory orderIds);

    // function cancelOrder(
    //     uint256 orderId,
    //     TradingTypes.TradeType tradeType,
    //     bool isIncrease
    // ) external;

    // function cancelOrders(CancelOrderRequest[] memory requests) external;

    // function cancelPositionOrders(uint256 pairIndex, bool isLong, bool isIncrease) external;

    // function createTpSl(
    //     TradingTypes.CreateTpSlRequest memory request
    // ) external returns (uint256 tpOrderId, uint256 slOrderId);
}
