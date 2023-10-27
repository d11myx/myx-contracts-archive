// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IExecutionEvent.sol";

interface ILiquidationLogic is IExecution {

    event ExecuteLiquidation(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 sizeAmount,
        uint256 price,
        uint256 orderId
    );

    function updateExecutor(address _executor) external;

    function liquidatePositions(ExecutePosition[] memory executePositions) external;

    function liquidationPosition(bytes32 positionKey, uint8 level, uint256 commissionRatio) external;
}
