// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IIndexPriceFeed.sol";

import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";

contract IndexPriceFeed is IIndexPriceFeed {
    IAddressesProvider public immutable ADDRESS_PROVIDER;
    uint256 public immutable PRICE_DECIMALS = 30;
    mapping(address => uint256) public assetPrices;

    constructor(
        IAddressesProvider addressProvider,
        address[] memory assets,
        uint256[] memory prices
    ) {
        ADDRESS_PROVIDER = addressProvider;
        _setAssetPrices(assets, prices);
    }

    modifier onlyKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(tx.origin), "opk");
        _;
    }

    function decimals() public pure override returns (uint256) {
        return 8;
    }

    function updatePrice(
        address[] calldata tokens,
        uint256[] memory prices
    ) external override onlyKeeper {
        _setAssetPrices(tokens, prices);
    }

    function getPrice(address token) external view override returns (uint256) {
        return assetPrices[token] * (10 ** (PRICE_DECIMALS - decimals()));
    }

    function _setAssetPrices(address[] memory assets, uint256[] memory prices) private {
        require(assets.length == prices.length, "inconsistent params length");
        for (uint256 i = 0; i < assets.length; i++) {
            assetPrices[assets[i]] = prices[i];
            emit PriceUpdate(assets[i], prices[i], msg.sender);
        }
    }
}
