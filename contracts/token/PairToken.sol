// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./BaseToken.sol";

contract PairToken is BaseToken {

    address public token0;
    address public token1;

    constructor(address _token0, address _token1) ERC20("MYX LPs", "MYX-LP") {
        token0 = _token0;
        token1 = _token1;
    }

}
