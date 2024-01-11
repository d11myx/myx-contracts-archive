// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../interfaces/IUiPositionDataProvider.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/IPoolView.sol";

contract UiPositionDataProvider is IUiPositionDataProvider {

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    constructor(IAddressesProvider addressProvider){
        ADDRESS_PROVIDER = addressProvider;
    }

    function getPositionsData(
        IPool pool,
        IPoolView poolView,
        IPositionManager positionManager,
        uint256 price
    ) public view returns (PositionData[] memory) {
        uint256 maxPairIndex = pool.pairsIndex();

        PositionData[] memory positionsData = new PositionData[](maxPairIndex);
        for (uint256 pairIndex = 1; pairIndex <= maxPairIndex; pairIndex++) {
            PositionData memory positionData = positionsData[pairIndex - 1];

            IPool.Pair memory pair = pool.getPair(pairIndex);
            positionData.pairIndex = pair.pairIndex;
            positionData.exposedPositions = positionManager.getExposedPositions(pairIndex);
            positionData.longTracker = positionManager.longTracker(pairIndex);
            positionData.shortTracker = positionManager.shortTracker(pairIndex);

            IPool.Vault memory vault = pool.getVault(pairIndex);
            positionData.indexTotalAmount = vault.indexTotalAmount;
            positionData.indexReservedAmount = vault.indexReservedAmount;
            positionData.stableTotalAmount = vault.stableTotalAmount;
            positionData.stableReservedAmount = vault.stableReservedAmount;
            positionData.poolAvgPrice = vault.averagePrice;

            positionData.currentFundingRate = positionManager.getCurrentFundingRate(pairIndex);
            positionData.nextFundingRate = positionManager.getNextFundingRate(pairIndex, price);
            positionData.nextFundingRateUpdateTime = positionManager.getNextFundingRateUpdateTime(pairIndex);

            positionData.lpPrice = poolView.lpFairPrice(pairIndex, price);
            positionData.lpTotalSupply = IERC20(pair.pairToken).totalSupply();
        }

        return positionsData;
    }
}
