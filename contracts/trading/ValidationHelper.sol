// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IPositionManager.sol";
import "../interfaces/IPool.sol";

library ValidationHelper {

    function validateAccountFrozen(IPositionManager positionManager, address account) internal view {
        require(!positionManager.isFrozen(account), 'account is frozen');
    }

    function validatePairEnabled(IPool.Pair memory pair) internal view {
        require(pair.enable, 'trade pair not supported');
    }

    function validateOrderExpired(uint256 orderTime, uint256 maxTimeDelay) internal view {
        require(orderTime + maxTimeDelay >= block.timestamp, 'order expired');
    }

    function validTradeSize(IPool.TradingConfig memory tradingConfig, uint256 size) internal view returns (bool) {
        return size >= tradingConfig.minTradeAmount && size <= tradingConfig.maxTradeAmount;
    }

}
