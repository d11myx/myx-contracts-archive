// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IFeeCollector {

    event UpdateLevelDiscountRatio(
        uint8 level,
        uint256 oldRatio,
        uint256 newRatio
    );

    event UpdateMaxCommissionRatio(
        uint256 oldRatio,
        uint256 newRatio
    );

    function levelDiscountRatios(uint8 level) external view returns (uint256 discountRatio);

    function maxCommissionRatio() external view returns (uint256 maxCommissionRatio);

    function updateLevelDiscountRatio(uint8 level, uint256 newRatio) external;

    function updateMaxCommissionRatio(uint256 newRatio) external;
}
