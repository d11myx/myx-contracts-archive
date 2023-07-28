// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IFastPriceFeed {
    function lastUpdatedAt() external view returns (uint256);
    function lastUpdatedBlock() external view returns (uint256);

    function setUpdater(address _account, bool _isActive) external;

    function setMaxPriceUpdateDelay(uint256 _maxPriceUpdateDelay) external;
    
    function setMinBlockInterval(uint256 _minBlockInterval) external;

    function setMaxDeviationBasisPoints(uint256 _maxDeviationBasisPoints) external;
    function setMaxCumulativeDeltaDiffs(address[] memory _tokens,  uint256[] memory _maxCumulativeDeltaDiffs) external;
    function setPriceDataInterval(uint256 _priceDataInterval) external;
    function setVaultPriceFeed(address _vaultPriceFeed) external;
    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external;
}
