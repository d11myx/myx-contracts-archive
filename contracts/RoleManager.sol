// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.17;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import  './interfaces/IAddressProvider.sol';
import  './interfaces/IRoleManager.sol';

contract RoleManager is AccessControl, IRoleManager {
    
    bytes32 public constant  EMERGENCY_ADMIN_ROLE = keccak256('EMERGENCY_ADMIN');
    bytes32 public constant  KEEPER_ROLE = keccak256('KEEPER_ROLE');
    
    

    using Address for address;

    mapping(address => bool) public contractWhiteList;
    mapping(address => bool) public excludeAssets;

    constructor(Ownable provider) {
        require(provider.owner() != address(0), "is 0");
        _setupRole(DEFAULT_ADMIN_ROLE, provider.owner());
    }


    function setRoleAdmin(
        bytes32 role,
        bytes32 adminRole
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
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

    
    function addRiskAdmin(address riskAdmin) external override {
        grantRole(EMERGENCY_ADMIN_ROLE, riskAdmin);
    }

    
    function removeRiskAdmin(address riskAdmin) external override {
        revokeRole(EMERGENCY_ADMIN_ROLE, riskAdmin);
    }

    
    function isRiskAdmin(address riskAdmin) external view override returns (bool) {
        return hasRole(EMERGENCY_ADMIN_ROLE, riskAdmin);
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
