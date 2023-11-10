// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';
import "./IExecutionLogic.sol";

interface IExecutor {

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable;

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable;

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable;

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable;

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecution.ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 tier,
        uint256 referralsRatio,
        uint256 referralUserRatio,
        address referralOwner
    ) external payable;

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecution.ExecutePosition[] memory executePositions
    ) external payable;

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool);
}
