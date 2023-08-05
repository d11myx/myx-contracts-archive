// SPDX-License-Identifier: MIT
import "./Governable.sol";
import "../../interfaces/IAddressesProvider.sol";
import "../../interfaces/IRoleManager.sol";

pragma solidity ^0.8.0;

abstract contract Handleable {

    mapping(address => bool) public isHandler;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    modifier onlyHandler() {
        require(msg.sender == address(this) || isHandler[msg.sender], "Handleable: forbidden");
        _;
    }

    modifier onlyAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isAdmin(msg.sender), "onlyAdmin");
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    constructor(IAddressesProvider addressProvider) {
        isHandler[msg.sender] = true;
        ADDRESS_PROVIDER = addressProvider;
    }

    function setHandler(address _handler, bool _isHandler) public onlyAdmin {
        isHandler[_handler] = _isHandler;
    }
}
