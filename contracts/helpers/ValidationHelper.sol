// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../interfaces/IPositionManager.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

// import 'hardhat/console.sol';

library ValidationHelper {
    using PrecisionUtils for uint256;

    function validateAccountBlacklist(IAddressesProvider addressesProvider, address account) internal view {
        require(!IRoleManager(addressesProvider.roleManager()).isBlackList(account), 'blacklist account');
    }

    function validateOrderExpired(uint256 orderTime, uint256 maxTimeDelay) internal view {
        require(orderTime + maxTimeDelay >= block.timestamp, 'order expired');
    }

    function validatePriceTriggered(
        IPool.TradingConfig memory tradingConfig,
        TradingTypes.TradeType tradeType,
        bool isAbove,
        uint256 currentPrice,
        uint256 orderPrice
    ) internal view {
        if (tradeType == TradingTypes.TradeType.MARKET || tradeType == TradingTypes.TradeType.LIMIT) {
            require(
                isAbove
                    ? currentPrice.mulPercentage(PrecisionUtils.percentage() - tradingConfig.priceSlipP) <= orderPrice
                    : currentPrice.mulPercentage(PrecisionUtils.percentage() + tradingConfig.priceSlipP) >= orderPrice,
                'not reach trigger price'
            );
        } else {
            require(isAbove ? currentPrice <= orderPrice : currentPrice >= orderPrice, 'not reach trigger price');
        }
    }

    function validTradeSize(IPool.TradingConfig memory tradingConfig, uint256 size) internal view returns (bool) {
        return size >= tradingConfig.minTradeAmount && size <= tradingConfig.maxTradeAmount;
    }
}
