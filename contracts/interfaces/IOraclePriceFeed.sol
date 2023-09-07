// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IOraclePriceFeed {
    event SetToken(address indexed toekn, address indexed priceFeed, uint256 priceDecimals);

    function getPrice(address _token) external view returns (uint256);

    // function getIndexPrice(address _token, uint256 _referencePrice) external view returns (uint256);

    // function getPrimaryPrice(address _token) external view returns (uint256);

    // function setTokenConfig(address _token, address _priceFeed, uint256 _priceDecimals) external;
}
