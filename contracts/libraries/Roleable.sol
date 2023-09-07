// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

abstract contract Roleable {
    mapping(address => bool) public isHandler;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    constructor(IAddressesProvider addressProvider) {
        isHandler[msg.sender] = true;
        ADDRESS_PROVIDER = addressProvider;
    }

    modifier onlyAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isAdmin(msg.sender), 'onlyAdmin');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }
}
