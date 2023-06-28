// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingVault.sol";

contract TradingVault is ITradingVault {

    struct Position {
        address account;
        uint256 pairIndex;
        bool isLong;
        uint256 collateral;
        uint256 positionSize;
        uint256 averagePrice;
        uint256 entryFundingRate;
    }

    mapping(address => bool) public override isFrozen;

    mapping(uint256 => int256) public override netExposureAmountChecker;



}
