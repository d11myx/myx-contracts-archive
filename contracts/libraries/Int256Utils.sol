// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

library Int256Utils {

    using Strings for uint256;

    function abs(int256 a) internal pure returns(uint256) {
        return a >= 0 ? uint256(a) : uint256(- a);
    }

    function min(int256 a, int256 b) internal pure returns(int256) {
        return a < b ? a : b;
    }

    function max(int256 a, int256 b) internal pure returns(int256) {
        return a > b ? a : b;
    }


    function toString(int256 amount) internal pure returns(string memory) {
        return string.concat(amount >= 0 ? "" : "-", abs(amount).toString());
    }

}
