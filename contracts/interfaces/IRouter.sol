// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';

interface IRouter {
    struct CreateOrderTpSlRequest {
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

    function createIncreaseOrder(
        TradingTypes.IncreasePositionWithTpSlRequest memory request
    ) external returns (uint256 orderId);

    function createIncreaseOrderWithoutTpSl(
        TradingTypes.IncreasePositionRequest memory request
    ) external returns (uint256 orderId);

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory request) external returns (uint256);

    function createDecreaseOrders(
        TradingTypes.DecreasePositionRequest[] memory requests
    ) external returns (uint256[] memory orderIds);

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelOrders(CancelOrderRequest[] memory requests) external;

    function cancelPositionOrders(uint256 pairIndex, bool isLong, bool isIncrease) external;

    function createTpSl(
        TradingTypes.CreateTpSlRequest memory request
    ) external returns (uint256 tpOrderId, uint256 slOrderId);

    // function addLiquidity(
    //     address indexToken,
    //     address stableToken,
    //     uint256 indexAmount,
    //     uint256 stableAmount
    // ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount);

    // function addLiquidityForAccount(
    //     address indexToken,
    //     address stableToken,
    //     address receiver,
    //     uint256 indexAmount,
    //     uint256 stableAmount
    // ) external;

    // function removeLiquidity(
    //     address indexToken,
    //     address stableToken,
    //     uint256 amount
    // ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount);

    // function removeLiquidityForAccount(
    //     address indexToken,
    //     address stableToken,
    //     address receiver,
    //     uint256 amount
    // ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount);
}
