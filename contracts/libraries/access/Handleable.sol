// SPDX-License-Identifier: MIT
import "../../openzeeplin/contracts-upgradeable/access/OwnableUpgradeable.sol";

pragma solidity ^0.8.0;

abstract contract Handleable is OwnableUpgradeable {
    mapping(address => bool) public isHandler;

    modifier onlyHandler() {
        require(isHandler[msg.sender], "Handleable: forbidden");
        _;
    }

    function __Handleable_init() internal onlyInitializing {
        __Ownable_init();
        isHandler[msg.sender] = true;
    }

    function setHandler(address _handler, bool _isHandler) public onlyOwner {
        isHandler[_handler] = _isHandler;
    }
}
