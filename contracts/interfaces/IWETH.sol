pragma solidity =0.8.17;

import '../openzeeplin/contracts/token/ERC20/IERC20.sol';

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint256) external;
}
