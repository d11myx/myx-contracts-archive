// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IPairToken.sol';

contract PairToken is IPairToken, ERC20, Ownable {
    address public token0;
    address public token1;

    mapping(address => bool) public miners;

    constructor(address _token0, address _token1) ERC20('MYX LPs', 'MYX-LP') {
        token0 = _token0;
        token1 = _token1;
    }

    modifier onlyMiner() {
        require(miners[msg.sender], 'miner forbidden');
        _;
    }

    function mint(address to, uint256 amount) external onlyMiner {
        _mint(to, amount);
    }

    function burn(address account, uint256 amount) external onlyMiner {
        _burn(account, amount);
    }

    function setMiner(address account, bool enable) external onlyOwner {
        miners[account] = enable;
    }
}
