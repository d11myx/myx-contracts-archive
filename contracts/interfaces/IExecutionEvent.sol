// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';
import '../libraries/Position.sol';

interface IExecution {

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

    event ExecuteAdl(
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 orderId,
        uint256[] adlOrderIds
    );

    event ExecuteOrderError(uint256 orderId, string errorMessage);

    event InvalidOrder(address sender, uint256 orderId, string message);

    struct ExecutePosition {
        bytes32 positionKey;
        uint256 sizeAmount;
        uint8 tier;
        uint256 referralsRatio;
        uint256 referralUserRatio;
        address referralOwner;
    }
}
