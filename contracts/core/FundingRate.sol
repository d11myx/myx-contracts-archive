// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IFundingRate.sol";
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
            _fundingFeeConfig.growthRate <= PrecisionUtils.percentage() &&
                _fundingFeeConfig.baseRate <= PrecisionUtils.percentage() &&
                _fundingFeeConfig.maxRate <= PrecisionUtils.percentage(),
            "exceed 100%"
        );

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function getFundingInterval(uint256 _pairIndex) public view override returns (uint256) {
        FundingFeeConfig memory fundingFeeConfig = fundingFeeConfigs[_pairIndex];
        return fundingFeeConfig.fundingInterval;
    }

    function getFundingRate(
        uint256 pairIndex,
        uint256 longTracker,
        uint256 shortTracker,
        IPool.Vault memory vault,
        uint256 price
    ) public view override returns (int256 fundingRate) {
        FundingFeeConfig memory fundingFeeConfig = fundingFeeConfigs[pairIndex];

        uint256 baseRate = fundingFeeConfig.baseRate;
        uint256 maxRate = fundingFeeConfig.maxRate;
        uint256 k = fundingFeeConfig.growthRate;

        uint256 u = longTracker;
        uint256 v = shortTracker;
        uint256 l = vault.indexTotalAmount + vault.stableTotalAmount.divPrice(price);

        // A = (U/U+V - 0.5) * MAX(U,V)/L * 100
        int256 a = u == v ? int256(0) : (int256(u.divPercentage(u + v)) - int256(PrecisionUtils.fundingRatePrecision().div(2)))
            * int256(Math.max(u, v).divPercentage(l)) * 100 / int256(PrecisionUtils.fundingRatePrecision());

        // S = ABS(2*R-1)=ABS(U-V)/(U+V)
        uint256 s = u == v ? 0 : (int256(u) - int256(v)).abs().divPercentage(u + v);

        // G1 = MIN((S+S*S/2) * k + r, r(max))
        uint256 g1 = Math.min(((s * s / 2).div(PrecisionUtils.fundingRatePrecision()) + s) * k / PrecisionUtils.fundingRatePrecision() + baseRate, maxRate);

        if (u == v) {
            return int256(g1);
        }
        // G1+ABS(G1*A/10) * (u-v)/abs(u-v)
        fundingRate = int256(g1) + int256(g1) * int256(a.abs()) / 10 / int256(PrecisionUtils.fundingRatePrecision());
        if (u < v) {
            fundingRate *= -1;
        }
        fundingRate = fundingRate / int256(86400 / fundingFeeConfig.fundingInterval);
    }
}
