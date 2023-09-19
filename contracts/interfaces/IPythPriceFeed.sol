// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

interface IPythPriceFeed is IPriceFeed {

    event AssetPriceIdUpdated(
        address asset,
        bytes32 priceId
    );

    event PythAddressUpdated(address oldAddress, address newAddress);

    function updatePythAddress(IPyth _pyth) external;

    function setAssetPriceIds(address[] memory assets, bytes32[] memory priceIds) external;
}
