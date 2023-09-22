// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPool.sol";

interface IFundingRate {
    struct FundingFeeConfig {
        uint256 growthRate; // Growth rate base
        uint256 baseRate; // Base interest rate
        uint256 maxRate; // Maximum interest rate
        uint256 fundingInterval;
    }

    function getFundingInterval(uint256 _pairIndex) external view returns (uint256);

    function getFundingRate(
        uint256 pairIndex,
        uint256 longTracker,
        uint256 shortTracker,
        IPool.Vault memory vault,
        uint256 price
    ) external view returns (int256 fundingRate);
}
