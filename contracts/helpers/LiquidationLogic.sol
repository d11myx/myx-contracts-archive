// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "../libraries/Position.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/IAddressesProvider.sol";
import "../helpers/TradingHelper.sol";
import "../interfaces/IExecutor.sol";

library LiquidationLogic {
    using PrecisionUtils for uint256;
    using Position for Position.Info;

    uint256 public constant MAX_RATIO = 3e6;

    event ExecuteLiquidation(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 sizeAmount,
        uint256 price
    );

    function liquidationPosition(
        IPool pool,
        IOrderManager orderManager,
        IPositionManager positionManager,
        IExecutor executor,
        IAddressesProvider addressesProvider,
        bytes32 positionKey,
        uint8 level,
        uint256 commissionRatio
    ) external {
        require(commissionRatio < MAX_RATIO, "max ratio");
        Position.Info memory position = positionManager.getPositionByKey(positionKey);
        if (position.positionAmount == 0) {
            return;
        }
        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        uint256 price = TradingHelper.getValidPrice(
            addressesProvider,
            pair.indexToken,
            tradingConfig
        );

        int256 unrealizedPnl = position.getUnrealizedPnl(position.positionAmount, price);
        uint256 tradingFee = positionManager.getTradingFee(
            position.pairIndex,
            position.isLong,
            position.positionAmount
        );
        int256 fundingFee = positionManager.getFundingFee(
            position.account,
            position.pairIndex,
            position.isLong
        );
        int256 exposureAsset = int256(position.collateral) +
            unrealizedPnl -
            int256(tradingFee) +
            fundingFee;

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
                sizeAmount: -int256(position.positionAmount),
                maxSlippage: 0,
                data: abi.encode(position.account)
            })
        );

        executor.executeDecreaseOrder(
            orderId,
            TradingTypes.TradeType.MARKET,
            level,
            commissionRatio
        );

        emit ExecuteLiquidation(
            positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.collateral,
            position.positionAmount,
            price
        );
    }
}
