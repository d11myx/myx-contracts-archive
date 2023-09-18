pragma solidity ^0.8.0;

interface IFundingRate {
    struct FundingFeeConfig {
        int256 minFundingRate; // Minimum capital rate 1e8 for 100%
        int256 maxFundingRate; // The maximum capital rate is 1e8 for 100%
        uint256 fundingWeightFactor; // The weight coefficient of the fund rate of both sides is  for 100%
        uint256 liquidityPremiumFactor; // The coefficient of liquidity to premium is 1e8 for 100%
        int256 interest;
        uint256 fundingInterval;
    }

    function getFundingRate(
        uint256 _pairIndex,
        // uint256 fundingInterval,
        int256 currentExposureAmountChecker,
        int256 lpVaulue,
        uint256 longTracker,
        uint256 shortTracker
    ) external view returns (int256 fundingRate);
}
