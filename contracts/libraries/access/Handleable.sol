// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../../interfaces/IAddressesProvider.sol';
import '../../interfaces/IRoleManager.sol';

abstract contract Handleable {
    mapping(address => bool) public isHandler;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    modifier onlyAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isAdmin(msg.sender), 'onlyAdmin');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    constructor(IAddressesProvider addressProvider) {
        isHandler[msg.sender] = true;
        ADDRESS_PROVIDER = addressProvider;
    }
}
