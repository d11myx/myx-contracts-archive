// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

interface IPythOraclePriceFeed is IPriceFeed {

    event TokenPriceIdUpdated(
        address token,
        bytes32 priceId
    );

    event PythAddressUpdated(address oldAddress, address newAddress);

    function updatePythAddress(IPyth _pyth) external;

    function setTokenPriceIds(address[] memory tokens, bytes32[] memory priceIds) external;

    function updatePrice(address[] calldata tokens, bytes[] calldata updateData) external payable;

}
