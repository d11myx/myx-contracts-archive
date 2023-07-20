// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../openzeeplin/contracts/utils/math/Math.sol";

library Int256Utils {


    function abs(int256 amount) internal view returns(uint256) {
        return amount >= 0 ? uint256(amount) : uint256(- amount);
    }

}
