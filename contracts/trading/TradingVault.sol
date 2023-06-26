// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingVault.sol";

contract TradingVault is ITradingVault {

    mapping(address => bool) public override isFrozen;

    struct Position {
        address account;

    }

}
