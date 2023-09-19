// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IIndexPriceFeed.sol";

contract IndexPriceFeed is IIndexPriceFeed {

    mapping(address => uint256) public assetPrices;

    constructor(address[] memory assets, uint256[] memory prices) {
        _setAssetPrices(assets, prices);
    }

    function decimals() external view override returns (uint256) {
        return 8;
    }

    function updatePrice(address[] calldata tokens, uint256[] memory prices) external payable override {
        _setAssetPrices(tokens, prices);
    }

    function getPrice(address token) external view override returns (uint256) {
        return assetPrices[token];
    }

    function _setAssetPrices(address[] memory assets, uint256[] memory prices) public {
        require(assets.length == prices.length, "inconsistent params length");
        for (uint256 i = 0; i < assets.length; i++) {
            assetPrices[assets[i]] = prices[i];
        }
    }
}
