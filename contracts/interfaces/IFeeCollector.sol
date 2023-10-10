// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IFeeCollector {

    event UpdateLevelDiscountRatio(
        uint8 level,
        uint256 oldMakerDiscountRatio,
        uint256 oldTakerDiscountRatio,
        uint256 newMakerDiscountRatio,
        uint256 newtakerDiscountRatio
    );

    event UpdateMaxReferralsRatio(uint256 oldRatio, uint256 newRatio);

    struct LevelDiscount {
        uint256 makerDiscountRatio;
        uint256 takerDiscountRatio;
    }

    function maxReferralsRatio() external view returns (uint256 maxReferenceRatio);

    function getLevelDiscounts(uint8 level) external view returns (LevelDiscount memory);

    function updateLevelDiscountRatio(uint8 level, LevelDiscount calldata newRatio) external;

    function updateMaxReferralsRatio(uint256 newRatio) external;
}
