// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../libraries/PrecisionUtils.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IPool.sol";
import "../helpers/TokenHelper.sol";

library TradingHelper {
    using PrecisionUtils for uint256;

    function getValidPrice(
        IAddressesProvider addressesProvider,
        address token,
        IPool.TradingConfig memory tradingConfig
    ) internal view returns (uint256) {
        uint256 oraclePrice = IPriceFeed(addressesProvider.priceOracle()).getPriceSafely(token);
        uint256 indexPrice = IPriceFeed(addressesProvider.indexPriceOracle()).getPrice(token);

        uint256 diffP = oraclePrice > indexPrice
            ? oraclePrice - indexPrice
            : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        require(diffP <= tradingConfig.maxPriceDeviationP, "exceed max price deviation");
        return oraclePrice;
    }

    function exposureAmountChecker(
        IPool.Vault memory lpVault,
        IPool.Pair memory pair,
        int256 exposedPositions,
        bool isLong,
        uint256 orderSize,
        uint256 executionPrice
    ) internal view returns (uint256 executionSize) {
        executionSize = orderSize;

        uint256 maxAvailableLiquidity = maxAvailableLiquidity(lpVault, pair, exposedPositions, isLong, executionPrice);
        if (executionSize > maxAvailableLiquidity) {
            executionSize = maxAvailableLiquidity;
        }
        return executionSize;
    }

    function maxAvailableLiquidity(
        IPool.Vault memory lpVault,
        IPool.Pair memory pair,
        int256 exposedPositions,
        bool isLong,
        uint256 executionPrice
    ) internal view returns (uint256 amount) {
        if (exposedPositions >= 0) {
            if (isLong) {
                amount = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
            } else {
                int256 availableStable = int256(lpVault.stableTotalAmount) - int256(lpVault.stableReservedAmount);
                uint256 stableToIndexAmount = uint256(TokenHelper.convertStableAmountToIndex(
                    pair,
                    availableStable > int256(0) ? availableStable : int256(0)
                ));
                amount = uint256(exposedPositions) + stableToIndexAmount.divPrice(executionPrice);
            }
        } else {
            if (isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                amount = uint256(-exposedPositions) + availableIndex;
            } else {
                int256 availableStable = int256(lpVault.stableTotalAmount) - int256(lpVault.stableReservedAmount);
                uint256 stableToIndexAmount = uint256(TokenHelper.convertStableAmountToIndex(
                    pair,
                    availableStable > int256(0) ? availableStable : int256(0)
                ));
                amount = stableToIndexAmount.divPrice(executionPrice);
            }
        }
        return amount;
    }
}
