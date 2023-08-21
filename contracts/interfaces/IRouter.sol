// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';

interface IRouter {
    event UpdateTradingRouter(address oldAddress, address newAddress);

    function createIncreaseOrder(TradingTypes.IncreasePositionWithTpSlRequest memory request) external returns (uint256 orderId);

    function createIncreaseOrderWithoutTpSl(TradingTypes.IncreasePositionRequest memory request) external returns (uint256 orderId);

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory request) external returns (uint256);

    function cancelIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function cancelAllPositionOrders(uint256 pairIndex, bool isLong) external;

    function cancelOrders(uint256 pairIndex, bool isLong, bool isIncrease) external;

    function createTpSl(
        TradingTypes.CreateTpSlRequest memory request
    ) external returns (uint256 tpOrderId, uint256 slOrderId);

    function addLiquidity(
        address pool,
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount
    ) external;

    function addLiquidityForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        uint256 indexAmount,
        uint256 stableAmount
    ) external;

    function removeLiquidity(
        address pool,
        address indexToken,
        address stableToken,
        uint256 amount
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount);

    function removeLiquidityForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        uint256 amount
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount);

    function swap(
        address pool,
        address indexToken,
        address stableToken,
        bool isBuy,
        uint256 amountIn,
        uint256 minOut
    ) external returns (uint256, uint256);

    function swapForAccount(
        address pool,
        address indexToken,
        address stableToken,
        address receiver,
        bool isBuy,
        uint256 amountIn,
        uint256 minOut
    ) external returns (uint256, uint256);
}
