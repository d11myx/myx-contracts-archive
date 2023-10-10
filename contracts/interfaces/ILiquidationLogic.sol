// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IExecutionEvent.sol";

interface ILiquidationLogic is IExecutionEvent {

    event ExecuteLiquidation(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 sizeAmount,
        uint256 price
    );

    function updateExecutor(address _executor) external;

    function liquidatePositions(bytes32[] memory positionKeys) external;

    function liquidationPosition(bytes32 positionKey) external;
}
