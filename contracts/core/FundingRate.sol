pragma solidity ^0.8.0;

import "../interfaces/IFundingRate.sol";
import "../interfaces/IPool.sol";

contract FundingRate is IFundingRate {
    IPool public immutable pool;

    constructor(IPool _pool) {
        pool = _pool;
    }

    function getFundingRate(
        uint256 _pairIndex,
        int256 currentExposureAmountChecker,
        uint256 longTracker,
        uint256 shortTracker

    ) public view  returns (uint256 fundingRate) {
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);
        int256 w = int256(fundingFeeConfig.fundingWeightFactor);
        int256 q = int256(longTracker[_pairIndex] + shortTracker[_pairIndex]);
        int256 k = int256(fundingFeeConfig.liquidityPremiumFactor);

        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        int256 l = int256(
            (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(_price) +
                (lpVault.stableTotalAmount - lpVault.stableReservedAmount)
        );

        if (q == 0) {
            fundingRate = 0;
        } else {
            fundingRate = (w * currentExposureAmountChecker * int256(PrecisionUtils.fundingRatePrecision())) / (k * q);
            if (l != 0) {
                fundingRate =
                    fundingRate +
                    ((int256(PrecisionUtils.fundingRatePrecision()) - w) * currentExposureAmountChecker) /
                    (k * l);
            }
        }
        fundingRate = (fundingRate - fundingFeeConfig.interest).max(fundingFeeConfig.minFundingRate).min(
            fundingFeeConfig.maxFundingRate
        );
        fundingRate = fundingRate / int256(365) / int256(86400 / fundingInterval);
    }
}
