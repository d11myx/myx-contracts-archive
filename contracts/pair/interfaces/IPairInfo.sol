// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IPairInfo {

    struct Pair {
        address indexToken;
        address stableToken;
        address pairToken;
        bool enable;
        uint256 kOfSwap;
        uint256 initPrice; // index / stable
        uint256 addLpFeeP;
    }

    struct TradingConfig {
        uint256 minLeverage;
        uint256 maxLeverage;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 maxPositionAmount;
        uint256 maintainMarginRate; // 10000 for 100%
        uint256 priceSlipP;
        uint256 maxPriceDeviationP;
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
        uint256 minFundingRate;             // 最小资金费率   1000000 for 100%
        uint256 maxFundingRate;             // 最大资金费率   1000000 for 100%
        uint256 fundingWeightFactor;        // 多空双方资金费率权重系数 10000 for 100%
        uint256 liquidityPremiumFactor;     // 流动性对于溢价的系数  10000 for 100%
        uint256 interest;
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
