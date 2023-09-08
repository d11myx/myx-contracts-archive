// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IOraclePriceFeed {
    event SetToken(address indexed toekn, address indexed priceFeed, uint256 priceDecimals);

    function getPrice(address _token) external view returns (uint256);
}
