// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';

interface IExecutor {
    event UpdateMaxTimeDelay(uint256 oldDelay, uint256 newDelay);

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        int256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        int256 pnl,
        bool needADL,
        uint256 tradingFee,
        int256 fundingFee
    );

     event LiquidatePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 collateral,
        uint256 price,
        uint256 orderId
    );


    function increaseMarketOrderStartIndex() external view returns (uint256);

    function decreaseMarketOrderStartIndex() external view returns (uint256);

    function maxTimeDelay() external view returns (uint256);

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external;

    // function setPricesAndExecuteMarketOrders(
    //     address[] memory tokens,
    //     uint256[] memory prices,
    //     uint256 timestamp,
    //     uint256 increaseEndIndex,
    //     uint256 decreaseEndIndex
    // ) external;

    function setPricesAndExecuteLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256[] memory increaseOrderIds,
        uint256[] memory decreaseOrderIds
    ) external;

    // function executeIncreaseMarketOrders(uint256 endIndex) external;

    function executeIncreaseLimitOrders(uint256[] memory orderIds) external;

    function executeIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external;

    // function executeDecreaseMarketOrders(uint256 endIndex) external;

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

    function claimTradingFee(address claimToken) external returns (uint256);
}
