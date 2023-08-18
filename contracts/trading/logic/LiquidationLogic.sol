// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../../libraries/Position.sol';
import "../../interfaces/IPool.sol";
import "../../interfaces/IPositionManager.sol";
import "../../interfaces/IOrderManager.sol";
import "../../interfaces/IExecutor.sol";

library LiquidationLogic {
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for Position.Info;

    event LiquidatePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 collateral,
        uint256 price,
        uint256 orderId
    );

    function liquidatePosition(
        Position.Info memory position,
        IExecutor executor,
        IPool pool,
        IOrderManager orderManager,
        IPositionManager positionManager,
        bytes32 _positionKey
    ) external {
//        Position.Info memory position = positionManager.getPositionByKey(_positionKey);

        if (position.positionAmount == 0) {
            return;
        }
        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        uint256 price = positionManager.getValidPrice(pair.indexToken, position.pairIndex, position.isLong);

        int256 unrealizedPnl = position.getUnrealizedPnl(position.positionAmount, price);
        uint256 tradingFee = positionManager.getTradingFee(position.pairIndex, position.isLong, position.positionAmount);
        int256 fundingFee = positionManager.getFundingFee(false, position.account, position.pairIndex, position.isLong, position.positionAmount);
        int256 exposureAsset = int256(position.collateral) + unrealizedPnl - int256(tradingFee) + (position.isLong ? -fundingFee : fundingFee);

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        bool needLiquidate;
        if (exposureAsset <= 0) {
            needLiquidate = true;
        } else {
            uint256 riskRate = position
                .positionAmount
                .mulPrice(position.averagePrice)
                .mulPercentage(tradingConfig.maintainMarginRate)
                .calculatePercentage(uint256(exposureAsset));
            needLiquidate = riskRate >= PrecisionUtils.percentage();
        }
        if (!needLiquidate) {
            return;
        }

        // cancel all positionOrders
        orderManager.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);

        uint256 orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: position.account,
                pairIndex: position.pairIndex,
                tradeType: TradingTypes.TradeType.MARKET,
                collateral: 0,
                openPrice: price,
                isLong: position.isLong,
                sizeAmount: -int256(position.positionAmount)
            })
        );

        executor.executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);

        emit LiquidatePosition(
            _positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.positionAmount,
            position.collateral,
            price,
            orderId
        );
    }
}
