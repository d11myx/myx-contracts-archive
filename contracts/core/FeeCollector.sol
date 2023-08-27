// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IFeeCollector.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

contract FeeCollector is IFeeCollector {
    // Discount ratio of every level (level => discountRatio)
    mapping(uint8 => uint256) public override levelDiscountRatios;

    // Maximum of reference ratio
    uint256 public override maxReferenceRatio;

    IAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IAddressesProvider addressesProvider) {
        ADDRESSES_PROVIDER = addressesProvider;
        maxReferenceRatio = 1e8;
        levelDiscountRatios[1] = 1000000;
        levelDiscountRatios[2] = 2000000;
        levelDiscountRatios[3] = 3000000;
        levelDiscountRatios[4] = 4000000;
        levelDiscountRatios[5] = 5000000;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESSES_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    function updateLevelDiscountRatio(uint8 level, uint256 newRatio) external override {
        require(newRatio <= PrecisionUtils.percentage(), 'exceeds max ratio');

        uint256 oldRatio = levelDiscountRatios[level];
        levelDiscountRatios[level] = newRatio;

        emit UpdateLevelDiscountRatio(level, oldRatio, newRatio);
    }

    function updateMaxReferenceRatio(uint256 newRatio) external override {
        require(newRatio <= PrecisionUtils.percentage(), 'exceeds max ratio');

        uint256 oldRatio = maxReferenceRatio;
        maxReferenceRatio = newRatio;

        emit UpdateMaxReferenceRatio(oldRatio, newRatio);
    }
}
