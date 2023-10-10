// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "../libraries/PrecisionUtils.sol";
import "../interfaces/IFeeCollector.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";

import "../libraries/Upgradeable.sol";

contract FeeCollector is IFeeCollector, Upgradeable {
    // Discount ratio of every level (level => LevelDiscount)
    mapping(uint8 => LevelDiscount) public levelDiscounts;

    // Maximum of referrals ratio
    uint256 public override maxReferralsRatio;

    function initialize(IAddressesProvider addressesProvider) public initializer {
        ADDRESS_PROVIDER = addressesProvider;
        maxReferralsRatio = PrecisionUtils.percentage();
        levelDiscounts[1] = LevelDiscount(1e6, 1e6);
        levelDiscounts[2] = LevelDiscount(2e6, 2e6);
        levelDiscounts[3] = LevelDiscount(3e6, 3e6);
        levelDiscounts[4] = LevelDiscount(4e6, 4e6);
        levelDiscounts[5] = LevelDiscount(5e6, 5e6);
    }

    function getLevelDiscounts(uint8 level) external view override returns (LevelDiscount memory) {
        return levelDiscounts[level];
    }

    function updateLevelDiscountRatio(
        uint8 level,
        LevelDiscount calldata discount
    ) external override {
        require(
            discount.makerDiscountRatio <= PrecisionUtils.percentage() &&
                discount.takerDiscountRatio <= PrecisionUtils.percentage(),
            "exceeds max ratio"
        );

        LevelDiscount memory oldDiscount = levelDiscounts[level];
        levelDiscounts[level] = discount;

        emit UpdateLevelDiscountRatio(
            level,
            oldDiscount.makerDiscountRatio,
            oldDiscount.takerDiscountRatio,
            levelDiscounts[level].makerDiscountRatio,
            levelDiscounts[level].takerDiscountRatio
        );
    }

    function updateMaxReferralsRatio(uint256 newRatio) external override {
        require(newRatio <= PrecisionUtils.percentage(), "exceeds max ratio");

        uint256 oldRatio = maxReferralsRatio;
        maxReferralsRatio = newRatio;

        emit UpdateMaxReferralsRatio(oldRatio, newRatio);
    }
}
