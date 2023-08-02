// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";


library PositionKey {

    enum TradeType {MARKET, LIMIT, TP, SL}

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function getOrderKey(bool _isIncrease, TradeType _tradeType, uint256 _orderId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_isIncrease, _tradeType, _orderId));
    }

}
