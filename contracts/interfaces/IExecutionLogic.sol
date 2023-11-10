// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/TradingTypes.sol";
import "../libraries/Position.sol";
import "./IExecutionEvent.sol";

interface IExecutionLogic is IExecution {
    event UpdateMaxTimeDelay(uint256 oldDelay, uint256 newDelay);

    struct ExecuteOrder {
        uint256 orderId;
        uint8 tier;
        uint256 referralsRatio;
        uint256 referralUserRatio;
        address referralOwner;
    }

    struct ExecutePositionInfo {
        Position.Info position;
        uint256 executionSize;
        uint8 tier;
        uint256 referralsRatio;
        uint256 referralUserRatio;
        address referralOwner;
    }

    function maxTimeDelay() external view returns (uint256);

    function updateExecutor(address _executor) external;

    function updateMaxTimeDelay(uint256 newMaxTimeDelay) external;

    function executeIncreaseMarketOrders(address keeper, ExecuteOrder[] memory orders) external;

    function executeIncreaseLimitOrders(address keeper, ExecuteOrder[] memory orders) external;

    function executeIncreaseOrder(
        address keeper,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 tier,
        uint256 referralsRatio,
        uint256 referralUserRatio,
        address referralOwner
    ) external;

    function executeDecreaseMarketOrders(address keeper, ExecuteOrder[] memory orders) external;

    function executeDecreaseLimitOrders(address keeper, ExecuteOrder[] memory orders) external;

    function executeDecreaseOrder(
        address keeper,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 tier,
        uint256 referralsRatio,
        uint256 referralUserRatio,
        address referralOwner,
        bool isSystem,
        uint256 executionSize,
        bool onlyOnce
    ) external;

    function executeADLAndDecreaseOrder(
        address keeper,
        ExecutePosition[] memory executePositions,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType,
        uint8 _tier,
        uint256 _referralsRatio,
        uint256 _referralUserRatio,
        address _referralOwner
    ) external;

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool needADL);
}
