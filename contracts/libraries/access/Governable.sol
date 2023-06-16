// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

abstract contract Governable {
    address public gov;

//    constructor() public {
//        gov = msg.sender;
//    }

    modifier onlyGov() {
        require(msg.sender == gov, "Governable: forbidden");
        _;
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
    }
}
