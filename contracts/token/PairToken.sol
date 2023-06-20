// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../openzeeplin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPairToken.sol";

contract PairToken is IPairToken, ERC20 {

    address public token0;
    address public token1;

    address public vault;


    constructor() ERC20("MYX LPs", "MYX-LP") {
        vault = msg.sender;
    }

    modifier onlyVault() {
        require(msg.sender == vault, 'forbidden');
        _;
    }

    function initialize(address _token0, address _token1) external onlyVault {
        token0 = _token0;
        token1 = _token1;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

}
