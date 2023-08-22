// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IPositionManager.sol";
import "../interfaces/IPool.sol";

library ValidationHelper {

    function validateAccountFrozen(IPositionManager positionManager, address account) external {
        require(!positionManager.isFrozen(account), 'account is frozen');
    }

    function validatePairEnabled(IPool.Pair calldata pair) external {
        require(pair.enable, 'trade pair not supported');
    }

    function validateOrderExpired(uint256 orderTime, uint256 maxTimeDelay) external {
        require(orderTime + maxTimeDelay >= block.timestamp, 'order expired');
    }

    function validTradeSize(IPool.TradingConfig calldata tradingConfig, uint256 size) external returns (bool) {
        return size >= tradingConfig.minTradeAmount && size <= tradingConfig.maxTradeAmount;
    }

}
