// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../interfaces/IIndexPriceFeed.sol';
import '../interfaces/IPool.sol';

// import 'hardhat/console.sol';

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
}
