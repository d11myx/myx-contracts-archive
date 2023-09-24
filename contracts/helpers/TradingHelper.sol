// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/PrecisionUtils.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IPool.sol";

library TradingHelper {
    using PrecisionUtils for uint256;

    function getValidPrice(
        IAddressesProvider addressesProvider,
        address token,
        IPool.TradingConfig memory tradingConfig
    ) internal view returns (uint256) {
        uint256 oraclePrice = IPriceOracle(addressesProvider.priceOracle()).getOraclePrice(token);
        uint256 indexPrice = IPriceOracle(addressesProvider.priceOracle()).getIndexPrice(token);

        uint256 diffP = oraclePrice > indexPrice
            ? oraclePrice - indexPrice
            : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        require(diffP <= tradingConfig.maxPriceDeviationP, "exceed max price deviation");
        return oraclePrice;
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
                if (executionSize > uint256(- exposedPositions) + availableIndex) {
                    executionSize = uint256(- exposedPositions) + availableIndex;
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

    function needADL(
        IPool.Vault memory lpVault,
        int256 exposedPositions,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) internal pure returns (bool) {
        bool needADL;
        if (exposedPositions >= 0) {
            if (!isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                needADL = executionSize > availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                needADL = executionSize > uint256(exposedPositions) + availableStable.divPrice(executionPrice);
            }
        } else {
            if (!isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                needADL = executionSize > uint256(- exposedPositions) + availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                needADL = executionSize > availableStable.divPrice(executionPrice);
            }
        }
        return needADL;
    }
}
