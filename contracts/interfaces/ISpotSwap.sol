// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISpotSwap {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external ;
}
