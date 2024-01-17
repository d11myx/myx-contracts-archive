// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../interfaces/IBacktracker.sol";

contract Backtracker is IBacktracker {

    event Backtracking(address account, uint64 round);

    event UnBacktracking(address account);

    bool public override backtracking;
    uint64 public override backtrackRound;

    constructor() {
        backtracking = false;
    }

    modifier whenNotBacktracking() {
        _requireNotBacktracking();
        _;
    }

    modifier whenBacktracking() {
        _requireBacktracking();
        _;
    }

    function enterBacktracking(uint64 _backtrackRound) external whenNotBacktracking {
        backtracking = true;
        backtrackRound = _backtrackRound;
        emit Backtracking(msg.sender, _backtrackRound);
    }

    function quitBacktracking() external whenBacktracking {
        backtracking = false;
        emit UnBacktracking(msg.sender);
    }

    function _requireNotBacktracking() internal view {
        require(!backtracking, "Backtracker: backtracking");
    }

    function _requireBacktracking() internal view {
        require(backtracking, "Backtracker: not backtracking");
    }
}
