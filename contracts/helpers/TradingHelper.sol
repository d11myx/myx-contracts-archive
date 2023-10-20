// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../libraries/PrecisionUtils.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IPool.sol";

library TradingHelper {
    using PrecisionUtils for uint256;

    function getValidPrice(
        IAddressesProvider addressesProvider,
        address token,
        IPool.TradingConfig memory tradingConfig
    ) internal view returns (uint256) {
        uint256 oraclePrice = IPriceFeed(addressesProvider.priceOracle()).getPrice(token);
        uint256 indexPrice = IPriceFeed(addressesProvider.indexPriceOracle()).getPrice(token);

        uint256 diffP = oraclePrice > indexPrice
            ? oraclePrice - indexPrice
            : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        require(diffP <= tradingConfig.maxPriceDeviationP, "exceed max price deviation");
        return oraclePrice;
    }

    function convertIndexAmountToStable(
        IPool.Pair memory pair,
        int256 indexTokenAmount
    ) internal view returns (int256 amount) {
        uint256 indexTokenDec = uint256(IERC20Metadata(pair.indexToken).decimals());
        uint256 stableTokenDec = uint256(IERC20Metadata(pair.stableToken).decimals());

        uint256 indexTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - indexTokenDec);
        uint256 stableTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - stableTokenDec);

        amount = indexTokenAmount * int256(indexTokenWad) / int256(stableTokenWad);
    }

    function exposureAmountChecker(
        IPool.Vault memory lpVault,
        int256 exposedPositions,
        bool isLong,
        uint256 orderSize,
        uint256 executionPrice
    ) internal pure returns (uint256 executionSize) {
        executionSize = orderSize;

        if (exposedPositions >= 0) {
            if (isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                if (executionSize > availableIndex) {
                    executionSize = availableIndex;
                }
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                if (
                    executionSize >
                    uint256(exposedPositions) + availableStable.divPrice(executionPrice)
                ) {
                    executionSize =
                        uint256(exposedPositions) +
                        availableStable.divPrice(executionPrice);
                }
            }
        } else {
            if (isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                if (executionSize > uint256(-exposedPositions) + availableIndex) {
                    executionSize = uint256(-exposedPositions) + availableIndex;
                }
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                if (executionSize > availableStable.divPrice(executionPrice)) {
                    executionSize = availableStable.divPrice(executionPrice);
                }
            }
        }
        return executionSize;
    }
}
