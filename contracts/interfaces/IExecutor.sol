// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';
import '../libraries/Position.sol';

interface IExecutor {
    event UpdateMaxTimeDelay(uint256 oldDelay, uint256 newDelay);

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        int256 collateral,
        uint256 orderSize,
        uint256 orderPrice,
        uint256 executionSize,
        uint256 executionPrice,
        uint256 executedSize,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        int256 collateral,
        uint256 orderSize,
        uint256 orderPrice,
        uint256 executionSize,
        uint256 executionPrice,
        uint256 executedSize,
        bool needADL,
        int256 pnl,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteOrderError(uint256 orderId, string errorMessage);

    struct ExecuteOrder {
        uint256 orderId;
        uint8 level;
        uint256 commissionRatio;
    }

    struct ExecutePosition {
        bytes32 positionKey;
        uint256 sizeAmount;
        uint8 level;
        uint256 commissionRatio;
    }

    struct ExecutePositionInfo {
        Position.Info position;
        uint8 level;
        uint256 commissionRatio;
    }

    function maxTimeDelay() external view returns (uint256);

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external;

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory increaseOrders
    ) external;

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external;

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory increaseOrders
    ) external;

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecuteOrder[] memory decreaseOrders
    ) external;

    function executeIncreaseMarketOrders(ExecuteOrder[] memory orders) external;

    function executeIncreaseLimitOrders(ExecuteOrder[] memory orders) external;

    function executeIncreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external;

    function executeDecreaseMarketOrders(ExecuteOrder[] memory orders) external;

    function executeDecreaseLimitOrders(ExecuteOrder[] memory orders) external;

    function executeDecreaseOrder(
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external;

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external;

    function executeADLAndDecreaseOrder(
        ExecutePosition[] memory executePositions,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 _level,
        uint256 _commissionRatio
    ) external;

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        ExecutePosition[] memory executePositions
    ) external;

    function liquidatePositions(ExecutePosition[] memory executePositions) external;

    // function claimTradingFee(address claimToken) external returns (uint256);
}
