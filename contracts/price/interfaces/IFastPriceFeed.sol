// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IFastPriceFeed {
    event PriceUpdate(address token, uint256 price, address priceFeed);
    event PriceData(address token, uint256 refPrice, uint256 fastPrice);
    function lastUpdatedAt() external view returns (uint256);
    function lastUpdatedBlock() external view returns (uint256);

    function setUpdater(address _account, bool _isActive) external;

    function setMaxPriceUpdateDelay(uint256 _maxPriceUpdateDelay) external;
    
    function setMinBlockInterval(uint256 _minBlockInterval) external;

    function setMaxDeviationBasisPoints(uint256 _maxDeviationBasisPoints) external;

    function setPriceDataInterval(uint256 _priceDataInterval) external;

    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external;
}
