// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IAddressesProvider {
    event AddressSet(bytes32 indexed id, address indexed oldAddress, address indexed newAddress);

    function timelock() external view returns (address);

    function priceOracle() external view returns (address);

    function indexPriceOracle() external view returns (address);

    function roleManager() external view returns (address);
}
