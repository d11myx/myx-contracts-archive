// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface IPairLiquidity {
    event AddLiquidity(
        address indexed funder,
        address indexed account,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount
    );

    event RemoveLiquidity(
        address indexed account,
        address indexed receiver,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount
    );

    event Swap(
        address indexed funder,
        address indexed receiver,
        uint256 indexed pairIndex,
        bool isBuy, // buy indexToken with stableToken
        uint256 amountIn,
        uint256 amountOut
    );
}
