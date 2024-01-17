// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IBacktracker {

    function backtracking() external view returns (bool);

    function backtrackRound() external view returns (uint64);

    function enterBacktracking(uint64 _backtrackRound) external;

    function quitBacktracking() external;
}
