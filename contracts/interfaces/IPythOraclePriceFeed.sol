// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPriceFeed.sol";
import "./IPythOracle.sol";

interface IPythOraclePriceFeed is IPriceFeed {

    event TokenPriceIdUpdated(
        address token,
        bytes32 priceId
    );

    event PythAddressUpdated(address oldAddress, address newAddress);

    event PriceAgeUpdated(uint256 oldAge, uint256 newAge);

    function updatePrice(address[] calldata tokens, bytes[] calldata updateData) external payable;

}
