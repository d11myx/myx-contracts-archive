// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IUiPoolDataProvider {

    struct PairData {
        uint256 pairIndex;
        address indexToken;
        address stableToken;
        address pairToken;
        bool increasePositionIsEnabled;
        bool decreasePositionIsEnabled;
        bool orderIsEnabled;
        bool addLiquidityIsEnabled;
        bool removeLiquidityIsEnabled;
        bool enable;
        uint256 kOfSwap;
        uint256 expectIndexTokenP;
        uint256 maxUnbalancedP;
        uint256 unbalancedDiscountRate;
        uint256 addLpFeeP;
        uint256 removeLpFeeP;
        uint256 minLeverage;
        uint256 maxLeverage;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 maxPositionAmount;
        uint256 maintainMarginRate;
        uint256 priceSlipP;
        uint256 maxPriceDeviationP;
        uint256 lpFeeDistributeP;
        uint256 stakingFeeDistributeP;
        uint256 keeperFeeDistributeP;
        uint256 indexTotalAmount;
        uint256 indexReservedAmount;
        uint256 stableTotalAmount;
        uint256 stableReservedAmount;
        uint256 poolAvgPrice;
        int256 currentFundingRate;
        int256 nextFundingRate;
        uint256 nextFundingRateUpdateTime;
        uint256 lpPrice;
        uint256 lpTotalSupply;
    }

}
