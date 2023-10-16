// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

interface IPythOraclePriceFeed is IPriceFeed {

    event AssetPriceIdUpdated(
        address asset,
        bytes32 priceId
    );

    event PythAddressUpdated(address oldAddress, address newAddress);

    function updatePythAddress(IPyth _pyth) external;

    function setAssetPriceIds(address[] memory assets, bytes32[] memory priceIds) external;

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable;

    function getUpdateData(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view returns (bytes[] memory updateData);

    function getUpdateFee(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view returns (uint);
}
