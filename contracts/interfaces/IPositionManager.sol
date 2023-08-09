// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/TradingTypes.sol";

interface IPositionManager {

    function transferTokenTo(address token, address to, uint256 amount) external;
}
