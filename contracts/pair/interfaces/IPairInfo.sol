// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IPairInfo {

    struct Pair {
        address indexToken;
        address stableToken;
        address pairToken;
        bool enable;
        uint256 kOfSwap; //Initial k value of liquidity
        uint256 expectIndexTokenP; //  10000 for 100%
        uint256 addLpFeeP; // Add liquidity fee
    }

    struct TradingConfig {
        uint256 minLeverage;
        uint256 maxLeverage;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 maxPositionAmount;
        uint256 maintainMarginRate; // Maintain the margin rate of 10000 for 100%
        uint256 priceSlipP; // Price slip point
        uint256 maxPriceDeviationP; // Maximum offset of index price
    }

    struct TradingFeeConfig {
        // fee
        uint256 takerFeeP;
        uint256 makerFeeP;
        // Distribute
        uint256 lpDistributeP;
        uint256 keeperDistributeP;
        uint256 treasuryDistributeP;
        uint256 refererDistributeP;
    }

    struct FundingFeeConfig {
        // factor
        int256 minFundingRate;             // Minimum capital rate 1,000,000 for 100%
        int256 maxFundingRate;             // The maximum capital rate is 1,000,000 for 100%
        int256 defaultFundingRate;          // default capital rate  1,000,000 for 100%
        uint256 fundingWeightFactor;        // The weight coefficient of the fund rate of both sides is 10000 for 100%
        uint256 liquidityPremiumFactor;     // The coefficient of liquidity to premium is 10,000 for 100%
        int256 interest;
        // Distribute
        uint256 lpDistributeP;
        uint256 userDistributeP;
        uint256 treasuryDistributeP;
    }

    function getPair(uint256) external view returns(Pair memory);

    function getTradingConfig(uint256 _pairIndex) external view returns(TradingConfig memory);

    function getTradingFeeConfig(uint256) external view returns(TradingFeeConfig memory);

    function getFundingFeeConfig(uint256) external view returns(FundingFeeConfig memory);

}
