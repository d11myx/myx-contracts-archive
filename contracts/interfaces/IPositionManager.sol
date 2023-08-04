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
}
