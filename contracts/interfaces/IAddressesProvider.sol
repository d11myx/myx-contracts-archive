// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IAddressesProvider {
    event AddressSet(bytes32 indexed id, address indexed oldAddress, address indexed newAddress);

    function getAddress(bytes32 id) external view returns (address);

    function setAddress(bytes32 id, address newAddress) external;

    function getPriceOracle() external view returns (address);

    function setPriceOracle(address newPriceOracle) external;

    function getIndexPriceOracle() external view returns (address);

    function setIndexPriceOracle(address newIndexPriceOracle) external;

    function getRoleManager() external view returns (address);

    function setRolManager(address) external;
}
