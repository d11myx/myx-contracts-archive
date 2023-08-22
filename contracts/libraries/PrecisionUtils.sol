// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/math/Math.sol';

library PrecisionUtils {
    uint256 public constant ONE_HUNDRED_PERCENTAGE = 10000;
    uint256 public constant FUNDING_RATE_PRECISION = 1000000;
    uint256 public constant PRICE_PRECISION = 1e30;

    function mulPrice(uint256 amount, uint256 price) internal pure returns (uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function divPrice(uint256 delta, uint256 price) internal pure returns (uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    function calculatePrice(uint256 delta, uint256 amount) internal pure returns (uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, amount);
    }

    function mulPercentage(uint256 amount, uint256 _percentage) internal pure returns (uint256) {
        return Math.mulDiv(amount, _percentage, ONE_HUNDRED_PERCENTAGE);
    }

    function divPercentage(uint256 amount, uint256 _percentage) internal pure returns (uint256) {
        return Math.mulDiv(amount, ONE_HUNDRED_PERCENTAGE, _percentage);
    }

    function calculatePercentage(uint256 amount0, uint256 amount1) internal pure returns (uint256) {
        return Math.mulDiv(amount0, ONE_HUNDRED_PERCENTAGE, amount1);
    }

    function percentage() internal pure returns (uint256) {
        return ONE_HUNDRED_PERCENTAGE;
    }

    function fundingRatePrecision() internal pure returns (uint256) {
        return FUNDING_RATE_PRECISION;
    }

    function pricePrecision() internal pure returns (uint256) {
        return PRICE_PRECISION;
    }
}
