// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IFeeCollector.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

contract FeeCollector is IFeeCollector {
    // Discount ratio of every level (level => discountRatio)
    mapping(uint8 => uint256) public override levelDiscountRatios;

    // Maximum of commission ratio
    uint256 public override maxCommissionRatio;

    IAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IAddressesProvider addressesProvider) {
        ADDRESSES_PROVIDER = addressesProvider;
        maxCommissionRatio = 10000;
        levelDiscountRatios[1] = 1000;
        levelDiscountRatios[2] = 2000;
        levelDiscountRatios[3] = 3000;
        levelDiscountRatios[4] = 4000;
        levelDiscountRatios[5] = 5000;
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

    function updateMaxCommissionRatio(uint256 newRatio) external override {
        require(newRatio <= PrecisionUtils.percentage(), 'exceeds max ratio');

        uint256 oldRatio = maxCommissionRatio;
        maxCommissionRatio = newRatio;

        emit UpdateMaxCommissionRatio(oldRatio, newRatio);
    }
}
