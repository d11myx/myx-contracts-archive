// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IRoleManager {
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external;

    function addAdmin(address) external;

    function removeAdmin(address) external;

    function isAdmin(address) external view returns (bool);

    function addPoolAdmin(address poolAdmin) external;

    function removePoolAdmin(address poolAdmin) external;

    function isPoolAdmin(address poolAdmin) external view returns (bool);

    function addOperator(address operator) external;

    function removeOperator(address operator) external;

    function isOperator(address operator) external view returns (bool);

    function addTreasurer(address treasurer) external;

    function removeTreasurer(address treasurer) external;

    function isTreasurer(address treasurer) external view returns (bool);

    function addKeeper(address) external;

    function removeKeeper(address) external;

    function isKeeper(address) external view returns (bool);

    function addAccountBlackList(address account) external;

    function removeAccountBlackList(address account) external;

    function isBlackList(address account) external view returns (bool);
}
