// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface ITradingVault {
    function isFrozen(address account) external view returns(bool);
}
