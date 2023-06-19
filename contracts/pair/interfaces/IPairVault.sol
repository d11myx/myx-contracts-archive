// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface IPairVault {
    function createPair(address token0, address token1) external returns (address);
}
