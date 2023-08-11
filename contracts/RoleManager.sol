// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.17;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IRoleManager.sol';

contract RoleManager is AccessControl, IRoleManager {
    bytes32 public constant POOL_ADMIN_ROLE = keccak256('POOL_ADMIN');
    bytes32 public constant OPERATOR_ROLE = keccak256('OPERATOR_ROLE');
    bytes32 public constant TREASURER_ROLE = keccak256('TREASURER_ROLE');
    bytes32 public constant KEEPER_ROLE = keccak256('KEEPER_ROLE');

    using Address for address;

    constructor(Ownable provider) {
        require(provider.owner() != address(0), 'is 0');
        _setupRole(DEFAULT_ADMIN_ROLE, provider.owner());
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }

    function addAdmin(address admin) external override {
        grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function removeAdmin(address admin) external override {
        revokeRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function isAdmin(address admin) external view override returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function addPoolAdmin(address poolAdmin) external override {
        grantRole(POOL_ADMIN_ROLE, poolAdmin);
    }

    function removePoolAdmin(address poolAdmin) external override {
        revokeRole(POOL_ADMIN_ROLE, poolAdmin);
    }

    function isPoolAdmin(address poolAdmin) external view override returns (bool) {
        return hasRole(POOL_ADMIN_ROLE, poolAdmin);
    }

    function addOperator(address operator) external override {
        grantRole(OPERATOR_ROLE, operator);
    }

    function removeOperator(address operator) external override {
        revokeRole(OPERATOR_ROLE, operator);
    }

    function isOperator(address operator) external view override returns (bool) {
        return hasRole(OPERATOR_ROLE, operator);
    }

    function addTreasurer(address treasurer) external override {
        grantRole(TREASURER_ROLE, treasurer);
    }

    function removeTreasurer(address treasurer) external override {
        revokeRole(TREASURER_ROLE, treasurer);
    }

    function isTreasurer(address treasurer) external view override returns (bool) {
        return hasRole(TREASURER_ROLE, treasurer);
    }

    function addKeeper(address keeper) external override {
        grantRole(KEEPER_ROLE, keeper);
    }

    function removeKeeper(address keeper) external override {
        revokeRole(KEEPER_ROLE, keeper);
    }

    function isKeeper(address keeper) external view override returns (bool) {
        return hasRole(KEEPER_ROLE, keeper);
    }
}
