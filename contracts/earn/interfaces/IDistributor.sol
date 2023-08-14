// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IDistributor {
    function updateRoot(bytes32 _merkleRoot) external;
    function claimForAccount(address account, address receiver, uint256 amount, bytes32[] calldata merkleProof) external;
}
