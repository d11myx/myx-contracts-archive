// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../interfaces/IPositionManager.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/TradingTypes.sol";

library ValidationHelper {
    using PrecisionUtils for uint256;

    function validateAccountBlacklist(
        IAddressesProvider addressesProvider,
        address account
    ) internal view {
        require(
            !IRoleManager(addressesProvider.roleManager()).isBlackList(account),
            "blacklist account"
        );
    }

    function validateOrderExpired(uint256 orderTime, uint256 maxTimeDelay) internal view {
        require(orderTime + maxTimeDelay >= block.timestamp, "order expired");
    }

    function validatePriceTriggered(
        IPool.TradingConfig memory tradingConfig,
        TradingTypes.TradeType tradeType,
        bool isAbove,
        uint256 currentPrice,
        uint256 orderPrice,
        uint256 maxSlippage
    ) internal pure {
        if (tradeType == TradingTypes.TradeType.MARKET) {
            bool valid = currentPrice >=
                orderPrice.mulPercentage(PrecisionUtils.percentage() - maxSlippage) &&
                currentPrice <= orderPrice.mulPercentage(PrecisionUtils.percentage() + maxSlippage);
            require(maxSlippage == 0 || valid, "exceeds max slippage");
        } else if (tradeType == TradingTypes.TradeType.LIMIT) {
            require(
                isAbove
                    ? currentPrice.mulPercentage(
                        PrecisionUtils.percentage() - tradingConfig.priceSlipP
                    ) <= orderPrice
                    : currentPrice.mulPercentage(
                        PrecisionUtils.percentage() + tradingConfig.priceSlipP
                    ) >= orderPrice,
                "not reach trigger price"
            );
        } else {
            require(
                isAbove ? currentPrice <= orderPrice : currentPrice >= orderPrice,
                "not reach trigger price"
            );
        }
    }
}
