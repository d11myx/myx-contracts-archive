// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface ISecondaryPriceFeed {
    function getPrice(address _token, uint256 _referencePrice) external view returns (uint256);
}
