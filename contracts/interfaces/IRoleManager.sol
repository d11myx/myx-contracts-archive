// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IRoleManager {

  
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external;

    function addAdmin(address ) external;

    function removeAdmin(address ) external;

    function isAdmin(address ) external view returns (bool);

    function addRiskAdmin(address ) external;

    function removeRiskAdmin(address ) external;

    function isRiskAdmin(address ) external view returns (bool);


    function addKeeper(address ) external;

    function removeKeeper(address ) external;

    function isKeeper(address ) external view returns (bool);
}
