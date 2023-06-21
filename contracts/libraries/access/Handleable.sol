// SPDX-License-Identifier: MIT
import "./Governable.sol";

pragma solidity ^0.8.0;

abstract contract Handleable is Governable {
    mapping(address => bool) public isHandler;

    modifier onlyHandler() {
        require(isHandler[msg.sender], "Handleable: forbidden");
        _;
    }

    function __Handleable_init() internal onlyInitializing {
        __Governable_init();
        isHandler[msg.sender] = true;
    }

    function setHandler(address _handler, bool _isHandler) public onlyGov {
        isHandler[_handler] = _isHandler;
    }
}
