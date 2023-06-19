// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPairToken {
    function initialize(address, address) external;
    function mint(address to, uint256 amount) external;
}
