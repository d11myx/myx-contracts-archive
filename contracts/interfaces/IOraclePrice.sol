// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IOraclePrice {
    function getPrice(address _token) external  view returns (uint256);
}
