// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IVaultPriceFeed {
   
    function setIsSecondaryPriceEnabled(bool _isEnabled) external;
    
    function setPriceSampleSpace(uint256 _priceSampleSpace) external;
    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external;
    function getPrice(address _token, bool _maximise) external view returns (uint256);
    function getSecondaryPrice(address _token, uint256 _referencePrice, bool _maximise) external view returns (uint256);

    function getLatestPrimaryPrice(address _token) external view returns (uint256);
    function getPrimaryPrice(address _token, bool _maximise) external view returns (uint256);
    function setTokenConfig(
        address _token,
        address _priceFeed,
        uint256 _priceDecimals
    ) external;
}
