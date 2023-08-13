// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPoolToken {
    function mint(address to, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function setMiner(address account, bool enable) external;
}
