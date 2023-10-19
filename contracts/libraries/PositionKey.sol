// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/math/Math.sol';
import '../libraries/TradingTypes.sol';

library PositionKey {
    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }
}
