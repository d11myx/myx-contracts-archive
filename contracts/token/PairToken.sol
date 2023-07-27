// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPairToken.sol";

contract PairToken is IPairToken, ERC20 {

    address public token0;
    address public token1;

    address public liquidity;


    constructor(address _token0, address _token1, address _liquidity) ERC20("MYX LPs", "MYX-LP") {
        token0 = _token0;
        token1 = _token1;
        liquidity = _liquidity;
    }

    modifier onlyLiquidity() {
        require(msg.sender == liquidity, 'forbidden');
        _;
    }

    function mint(address to, uint256 amount) external onlyLiquidity {
        _mint(to, amount);
    }

    function burn(address account, uint256 amount) external onlyLiquidity {
        _burn(account, amount);
    }


}
