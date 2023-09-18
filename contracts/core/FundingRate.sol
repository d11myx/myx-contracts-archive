pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IFundingRate.sol";
import "../interfaces/IOraclePriceFeed.sol";
import "../interfaces/IPool.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Roleable.sol";
import "../libraries/Int256Utils.sol";

contract FundingRate is IFundingRate, Roleable {
    using PrecisionUtils for uint256;
    using Int256Utils for int256;
    using Math for uint256;
    using SafeMath for uint256;

    IPool public immutable pool;

    uint256 public fundingInterval;

    constructor(IAddressesProvider addressProvider, IPool _pool) Roleable(addressProvider) {
        pool = _pool;
    }

    function getFundingRate(
        uint256 _pairIndex,
        int256 currentExposureAmountChecker,
        uint256 longTracker,
        uint256 shortTracker
    ) public view returns (int256 fundingRate) {
        IPool.Pair memory pair = pool.getPair(_pairIndex);
        IPool.FundingFeeConfig memory fundingFeeConfig = pool.getFundingFeeConfig(_pairIndex);
        int256 w = int256(fundingFeeConfig.fundingWeightFactor);
        int256 q = int256(longTracker + shortTracker);
        int256 k = int256(fundingFeeConfig.liquidityPremiumFactor);

        IPool.Vault memory lpVault = pool.getVault(_pairIndex);
        uint256 _price = IOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(pair.indexToken);
        int256 l = int256(
            (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(_price) +
                (lpVault.stableTotalAmount - lpVault.stableReservedAmount)
        );

        if (q == 0) {
            fundingRate = 0;
        } else {
            fundingRate =
                (w * currentExposureAmountChecker * int256(PrecisionUtils.fundingRatePrecision())) /
                (k * q);
            if (l != 0) {
                fundingRate =
                    fundingRate +
                    ((int256(PrecisionUtils.fundingRatePrecision()) - w) *
                        currentExposureAmountChecker) /
                    (k * l);
            }
        }
        fundingRate = (fundingRate - fundingFeeConfig.interest)
            .max(fundingFeeConfig.minFundingRate)
            .min(fundingFeeConfig.maxFundingRate);
        fundingRate = fundingRate / int256(365) / int256(86400 / fundingInterval);
    }
}
