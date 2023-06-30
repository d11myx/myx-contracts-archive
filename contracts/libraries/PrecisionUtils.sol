// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../openzeeplin/contracts/utils/math/Math.sol";

library PrecisionUtils {

    uint256 public constant ONE_HUNDRED_PERCENTAGE = 10000;
    uint256 public constant PRICE_PRECISION = 1e30;

    function getDelta(uint256 amount, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function getAmount(uint256 delta, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    function mulPercentage(uint256 amount, uint256 percentage) internal view returns(uint256) {
        return Math.mulDiv(amount, percentage, ONE_HUNDRED_PERCENTAGE);
    }

    function divPercentage(uint256 amount, uint256 percentage) internal view returns(uint256) {
        return Math.mulDiv(amount, ONE_HUNDRED_PERCENTAGE, percentage);
    }

}
