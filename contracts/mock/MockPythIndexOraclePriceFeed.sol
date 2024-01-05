// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IIndexPriceFeed.sol";

contract MockPythIndexOraclePriceFeed is IPythOraclePriceFeed {
    IAddressesProvider public immutable ADDRESS_PROVIDER;

    constructor(IAddressesProvider addressProvider) {
        ADDRESS_PROVIDER = addressProvider;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), "opa");
        _;
    }

    function updatePrice(
        address[] calldata tokens,
        bytes[] calldata _updateData
    ) external payable override {
    }

    function getPrice(address token) external view override returns (uint256) {
        return IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).getPrice(token);
    }

    function getPriceSafely(address token) external view override returns (uint256) {
        return IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).getPriceSafely(token);
    }

    function decimals() public pure returns (uint256) {
        return 30;
    }
}
