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

    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;

    constructor(IAddressesProvider addressProvider) Roleable(addressProvider) {}

    function updateFundingFeeConfig(
        uint256 _pairIndex,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyPoolAdmin {
        require(
            _fundingFeeConfig.fundingWeightFactor <= PrecisionUtils.percentage() &&
                _fundingFeeConfig.liquidityPremiumFactor <= PrecisionUtils.percentage(),
            "exceed 100%"
        );

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function getFundingRate(
        uint256 _pairIndex,
        uint256 fundingInterval,
        int256 currentExposureAmountChecker,
        int256 lpVaulue,
        uint256 longTracker,
        uint256 shortTracker
    ) public view override returns (int256 fundingRate) {
        FundingFeeConfig memory fundingFeeConfig = fundingFeeConfigs[_pairIndex];
        int256 w = int256(fundingFeeConfig.fundingWeightFactor);
        int256 q = int256(longTracker + shortTracker);
        int256 k = int256(fundingFeeConfig.liquidityPremiumFactor);

        if (q == 0) {
            fundingRate = 0;
        } else {
            fundingRate =
                (w * currentExposureAmountChecker * int256(PrecisionUtils.fundingRatePrecision())) /
                (k * q);
            if (lpVaulue != 0) {
                fundingRate =
                    fundingRate +
                    ((int256(PrecisionUtils.fundingRatePrecision()) - w) *
                        currentExposureAmountChecker) /
                    (k * lpVaulue);
            }
        }
        fundingRate = (fundingRate - fundingFeeConfig.interest)
            .max(fundingFeeConfig.minFundingRate)
            .min(fundingFeeConfig.maxFundingRate);
        fundingRate = fundingRate / int256(365) / int256(86400 / fundingInterval);
    }
}
