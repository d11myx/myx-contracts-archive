// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IFeeDistributor.sol';
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";

contract FeeDistributor is IFeeDistributor {

    // Discount ratio of every level (level => discountRatio)
    mapping(uint256 => uint256) public override levelDiscountRatios;

    // Maximum of commission ratio
    uint256 public override maxCommissionRatio;

    IAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IAddressesProvider addressesProvider, uint256 _maxCommissionRatio) {
        ADDRESSES_PROVIDER = addressesProvider;
        maxCommissionRatio = _maxCommissionRatio;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESSES_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    function updateLevelDiscountRatio(uint256 level, uint256 newRatio) external override {
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
