// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IFastPriceFeed {
    event PriceUpdate(address token, uint256 price, address priceFeed);
    event PriceData(address token, uint256 refPrice, uint256 fastPrice);
    function lastUpdatedAt() external view returns (uint256);
    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external;
    function setPrices(address[] memory _tokens, uint256[] memory _prices, uint256 _timestamp) external;
}
