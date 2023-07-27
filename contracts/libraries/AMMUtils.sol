// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/math/Math.sol";

library AMMUtils {

    function getReserve(
        uint256 k,
        uint256 price,
        uint256 pricePrecision
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        require(price > 0, "Invalid price");
        require(k > 0, "Invalid k");

        reserveB = Math.sqrt(Math.mulDiv(k, price, pricePrecision));
        reserveA = k / reserveB;
        return (reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal view returns (uint256 amountOut) {
        require(amountIn > 0, "Invalid amount");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserve");
        amountOut = Math.mulDiv(amountIn, reserveOut, reserveIn + amountIn);
    }

}
