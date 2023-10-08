// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

interface IRiskReserve {

    event UpdatedDaoAddress(
        address sender,
        address oldAddress,
        address newAddress
    );

    event UpdatedPositionManagerAddress(
        address sender,
        address oldAddress,
        address newAddress
    );

    event Withdraw(
        address sender,
        address asset,
        uint256 amount,
        address to
    );

    function updateDaoAddress(address newAddress) external;

    function updatePositionManagerAddress(address newAddress) external;

    function increase(address asset, uint256 amount) external;

    function decrease(address asset, uint256 amount) external;

    function recharge(address asset, uint256 amount) external;

    function withdraw(address asset, uint256 amount, address to) external;

    function rescue(address asset, address to) external;
}
