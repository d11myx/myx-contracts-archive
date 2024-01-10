// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../interfaces/IUiPoolDataProvider.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/IPoolView.sol";
import "../interfaces/IRouter.sol";

contract UiPoolDataProvider is IUiPoolDataProvider {

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    constructor(IAddressesProvider addressProvider){
        ADDRESS_PROVIDER = addressProvider;
    }

    function getPairsData(
        IPool pool,
        IPoolView poolView,
        IPositionManager positionManager,
        IRouter router,
        uint256 price
    ) public view returns (PairData[] memory) {
        uint256 maxPairIndex = pool.pairsIndex();

        PairData[] memory pairsData = new PairData[](maxPairIndex);
        for (uint256 pairIndex = 1; pairIndex <= maxPairIndex; pairIndex++) {
            PairData memory pairData = pairsData[pairIndex - 1];

            IPool.Pair memory pair = pool.getPair(pairIndex);
            pairData.pairIndex = pair.pairIndex;
            pairData.indexToken = pair.indexToken;
            pairData.stableToken = pair.stableToken;
            pairData.pairToken = pair.pairToken;
            pairData.enable = pair.enable;
            pairData.kOfSwap = pair.kOfSwap;
            pairData.expectIndexTokenP = pair.expectIndexTokenP;
            pairData.maxUnbalancedP = pair.maxUnbalancedP;
            pairData.unbalancedDiscountRate = pair.unbalancedDiscountRate;
            pairData.addLpFeeP = pair.addLpFeeP;
            pairData.removeLpFeeP = pair.removeLpFeeP;

            IRouter.OperationStatus memory operationStatus = router.getOperationStatus(pairIndex);
            pairData.increasePositionIsEnabled = !operationStatus.increasePositionDisabled;
            pairData.decreasePositionIsEnabled = !operationStatus.decreasePositionDisabled;
            pairData.orderIsEnabled = !operationStatus.orderDisabled;
            pairData.addLiquidityIsEnabled = !operationStatus.addLiquidityDisabled;
            pairData.removeLiquidityIsEnabled = !operationStatus.removeLiquidityDisabled;

            IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);
            pairData.minLeverage = tradingConfig.minLeverage;
            pairData.maxLeverage = tradingConfig.maxLeverage;
            pairData.minTradeAmount = tradingConfig.minTradeAmount;
            pairData.maxTradeAmount = tradingConfig.maxTradeAmount;
            pairData.maxPositionAmount = tradingConfig.maxPositionAmount;
            pairData.maintainMarginRate = tradingConfig.maintainMarginRate;
            pairData.priceSlipP = tradingConfig.priceSlipP;
            pairData.maxPriceDeviationP = tradingConfig.maxPriceDeviationP;

            IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pairIndex);
            pairData.lpFeeDistributeP = tradingFeeConfig.lpFeeDistributeP;
            pairData.stakingFeeDistributeP = tradingFeeConfig.stakingFeeDistributeP;
            pairData.keeperFeeDistributeP = tradingFeeConfig.keeperFeeDistributeP;

            IPool.Vault memory vault = pool.getVault(pairIndex);
            pairData.indexTotalAmount = vault.indexTotalAmount;
            pairData.indexReservedAmount = vault.indexReservedAmount;
            pairData.stableTotalAmount = vault.stableTotalAmount;
            pairData.stableReservedAmount = vault.stableReservedAmount;
            pairData.poolAvgPrice = vault.averagePrice;

            pairData.currentFundingRate = positionManager.getCurrentFundingRate(pairIndex);
            pairData.nextFundingRate = positionManager.getNextFundingRate(pairIndex, price);
            pairData.nextFundingRateUpdateTime = positionManager.getNextFundingRateUpdateTime(pairIndex);

            pairData.lpPrice = poolView.lpFairPrice(pairIndex, price);
            pairData.lpTotalSupply = IERC20(pair.pairToken).totalSupply();
        }

        return pairsData;
    }
}
