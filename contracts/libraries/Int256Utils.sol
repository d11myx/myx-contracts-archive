// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

library Int256Utils {

    using Strings for uint256;

    function abs(int256 amount) internal pure returns(uint256) {
        return amount >= 0 ? uint256(amount) : uint256(- amount);
    }

    function toString(int256 amount) internal pure returns(string memory) {
        return string.concat(amount >= 0 ? "" : "-", abs(amount).toString());
    }

}
