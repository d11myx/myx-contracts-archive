pragma solidity >=0.8.0;

interface ISwapCallback {
    function swapCallback(
        address indexToken,
        address stableToken,
        int256 indexAmount,
        int256 stableAmount,
        bytes calldata data
    ) external;
}
