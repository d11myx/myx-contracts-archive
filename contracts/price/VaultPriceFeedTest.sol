// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./interfaces/IVaultPriceFeed.sol";

contract VaultPriceFeedTest is IVaultPriceFeed {

    mapping(address => uint256) public tokenPrice;

    function adjustmentBasisPoints(address _token) external view override returns (uint256) {return 0;}
    function isAdjustmentAdditive(address _token) external view override returns (bool) {return false;}
    function setAdjustment(address _token, bool _isAdditive, uint256 _adjustmentBps) external override {}
    function setUseV2Pricing(bool _useV2Pricing) external override {}
    function setIsAmmEnabled(bool _isEnabled) external override {}
    function setIsSecondaryPriceEnabled(bool _isEnabled) external override {}
    function setSpreadBasisPoints(address _token, uint256 _spreadBasisPoints) external override {}
    function setSpreadThresholdBasisPoints(uint256 _spreadThresholdBasisPoints) external override {}
    function setFavorPrimaryPrice(bool _favorPrimaryPrice) external override {}
    function setPriceSampleSpace(uint256 _priceSampleSpace) external override {}
    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external override {}
    function getPrice(address _token, bool _maximise, bool _includeAmmPrice, bool _useSwapPricing) external view override returns (uint256) {
        return tokenPrice[_token];
    }
    function getAmmPrice(address _token) external view returns (uint256) {return 0;}
    function getLatestPrimaryPrice(address _token) external view returns (uint256) {return 0;}
    function getPrimaryPrice(address _token, bool _maximise) external view returns (uint256) {return 0;}
    function setTokenConfig(
        address _token,
        address _priceFeed,
        uint256 _priceDecimals,
        bool _isStrictStable
    ) external {}

    function setPrice(address _token, uint256 _price) external {
        tokenPrice[_token] = _price;
    }
}
