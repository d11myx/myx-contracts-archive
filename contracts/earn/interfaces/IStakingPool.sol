// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IStakingPool {
    function stakeForAccount(address funder, address account, uint256 amount) external;
    function unstakeForAccount(address account, address receiver, uint256 amount) external;
}
