// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";

interface IIndexPriceFeed is IPriceFeed {

    event PriceUpdate(address asset, uint256 price, address sender);

    function updatePrice(address[] calldata tokens, uint256[] memory prices) external;
}
