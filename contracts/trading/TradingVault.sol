// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingVault.sol";
import "../openzeeplin/contracts/security/ReentrancyGuard.sol";

contract TradingVault is ReentrancyGuard, ITradingVault {

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


    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _sizeDelta,
        bool _isLong
    ) external nonReentrant {


    }

}
