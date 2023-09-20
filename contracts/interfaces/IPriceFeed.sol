// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPriceFeed {

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable;

    function getPrice(address token) external view returns (uint256);

    function decimals() external view returns (uint256);

    function getUpdateFee(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view returns (uint);

}
