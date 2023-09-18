// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../interfaces/IIndexPriceFeed.sol';
import '../interfaces/IPool.sol';

library TradingHelper {
    using PrecisionUtils for uint256;

    function getValidPrice(
        IAddressesProvider addressesProvider,
        address token,
        IPool.TradingConfig memory tradingConfig
    ) internal view returns (uint256) {
        uint256 oraclePrice = IOraclePriceFeed(addressesProvider.priceOracle()).getPrice(token);

        uint256 indexPrice = IIndexPriceFeed(addressesProvider.indexPriceOracle()).getPrice(token);

        uint256 diffP = oraclePrice > indexPrice ? oraclePrice - indexPrice : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        require(diffP <= tradingConfig.maxPriceDeviationP, 'exceed max price deviation');
        return oraclePrice;
    }

    function exposureAmountChecker(
        IPool.Vault memory lpVault,
        int256 exposureAmount,
        bool isLong,
        uint256 orderSize,
        uint256 executionPrice
    ) internal pure returns (uint256 executionSize) {
        executionSize = orderSize;

        if (exposureAmount >= 0) {
            if (isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
//                require(executionSize <= availableIndex, 'iit');
                if (executionSize > availableIndex) {
                    executionSize = availableIndex;
                }
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
//                require(
//                    executionSize <= uint256(exposureAmount) + availableStable.divPrice(executionPrice),
//                    'ist'
//                );
                if (executionSize > uint256(exposureAmount) + availableStable.divPrice(executionPrice)) {
                    executionSize = uint256(exposureAmount) + availableStable.divPrice(executionPrice);
                }
            }
        } else {
            if (isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
//                require(executionSize <= uint256(- exposureAmount) + availableIndex, 'iit');
                if (executionSize > uint256(- exposureAmount) + availableIndex) {
                    executionSize = uint256(- exposureAmount) + availableIndex;
                }
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
//                require(executionSize <= availableStable.divPrice(executionPrice), 'ist');
                if (executionSize > availableStable.divPrice(executionPrice)) {
                    executionSize = availableStable.divPrice(executionPrice);
                }
            }
        }
        return executionSize;
    }
}
