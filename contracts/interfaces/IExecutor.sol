// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/TradingTypes.sol";

interface IExecutor {

    event UpdateExecuteRouter(address oldAddress, address newAddress);

    function increaseMarketOrderStartIndex() external view returns (uint256);

    function decreaseMarketOrderStartIndex() external view returns (uint256);

    function setPricesAndExecuteMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256 increaseEndIndex,
        uint256 decreaseEndIndex
    ) external;

    function setPricesAndExecuteLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256[] memory increaseOrderIds,
        uint256[] memory decreaseOrderIds
    ) external;

    function executeIncreaseMarketOrders(uint256 endIndex) external;

    function executeIncreaseLimitOrders(uint256[] memory orderIds) external;

    function executeIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function executeDecreaseMarketOrders(uint256 endIndex) external;

    function executeDecreaseLimitOrders(uint256[] memory orderIds) external;

    function executeDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys
    ) external;

    function liquidatePositions(bytes32[] memory positionKeys) external;

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys,
        uint256[] memory sizeAmounts,
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external;

    function executeADLAndDecreaseOrder(
        bytes32[] memory positionKeys,
        uint256[] memory sizeAmounts,
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external;
}
