// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPositionManager {

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

    function setPricesAndLiquidatePositions(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys
    ) external;

    function liquidatePositions(bytes32[] memory _positionKeys) external;
}
