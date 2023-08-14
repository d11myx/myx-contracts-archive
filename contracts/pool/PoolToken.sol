// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '../interfaces/IPoolToken.sol';

import '../libraries/Roleable.sol';

contract PoolToken is IPoolToken, Roleable, ERC20 {
    address public token0;
    address public token1;

    mapping(address => bool) public miners;

    constructor(
        IAddressesProvider addressProvider,
        address _token0,
        address _token1
    ) Roleable(addressProvider) ERC20('MYX LPs', 'MYX-LP') {
        token0 = _token0;
        token1 = _token1;
        miners[msg.sender] = true;
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

    //todo lock time
    function setMiner(address account, bool enable) external onlyAdmin {
        miners[account] = enable;
    }
}
