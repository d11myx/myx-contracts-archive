// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts/utils/math/Math.sol";

library AMMUtils {

    function getReserve(uint256 k, uint256 price, uint256 pricePrecision) external view returns (uint256 reserveA, uint256 reserveB) {
        require(price > 0, "Invalid price");
        require(k > 0, "Invalid k");

        reserveB = Math.sqrt(Math.mulDiv(k, price, pricePrecision));
        reserveA = k / reserveB;
        return (reserveA, reserveB);
    }

    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) external view returns (uint256 amountB) {
        require(amountA > 0, "Invalid amount");
        require(reserveA > 0 && reserveB > 0, "Invalid reserve");
        amountB = Math.mulDiv(amountA, reserveB, reserveA);
    }

}
