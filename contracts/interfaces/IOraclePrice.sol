// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IOraclePrice {
    function getPrice(address _token) external view returns (uint256);
}
