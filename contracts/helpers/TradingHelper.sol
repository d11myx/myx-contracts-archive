// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/PrecisionUtils.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../interfaces/IPool.sol';
import 'hardhat/console.sol';

library TradingHelper {
    using PrecisionUtils for uint256;

    function getValidPrice(
        IAddressesProvider addressesProvider,
        address token,
        IPool.TradingConfig memory tradingConfig
    ) internal view returns (uint256) {
        IOraclePriceFeed oraclePriceFeed = IOraclePriceFeed(addressesProvider.getPriceOracle());

        uint256 oraclePrice = oraclePriceFeed.getPrice(token);

        uint256 indexPrice = oraclePriceFeed.getIndexPrice(token, 0);

        uint256 diffP = oraclePrice > indexPrice ? oraclePrice - indexPrice : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        require(diffP <= tradingConfig.maxPriceDeviationP, 'exceed max price deviation');
        return oraclePrice;
    }
}
