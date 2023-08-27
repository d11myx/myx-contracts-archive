// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IFeeCollector {

    event UpdateLevelDiscountRatio(
        uint8 level,
        uint256 oldRatio,
        uint256 newRatio
    );

    event UpdateMaxReferenceRatio(
        uint256 oldRatio,
        uint256 newRatio
    );

    function levelDiscountRatios(uint8 level) external view returns (uint256 discountRatio);

    function maxReferenceRatio() external view returns (uint256 maxReferenceRatio);

    function updateLevelDiscountRatio(uint8 level, uint256 newRatio) external;

    function updateMaxReferenceRatio(uint256 newRatio) external;
}
