// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";

interface IIndexPriceFeed is IPriceFeed {

    function updatePrice(address[] calldata tokens, uint256[] memory prices) external;
}
