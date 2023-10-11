// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';
import '../libraries/Position.sol';

interface IExecutionEvent {

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        int256 collateral,
        uint256 orderSize,
        uint256 orderPrice,
        uint256 executionSize,
        uint256 executionPrice,
        uint256 executedSize,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        int256 collateral,
        uint256 orderSize,
        uint256 orderPrice,
        uint256 executionSize,
        uint256 executionPrice,
        uint256 executedSize,
        bool needADL,
        int256 pnl,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteOrderError(uint256 orderId, string errorMessage);
}
