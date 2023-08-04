// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/type/TradingTypes.sol";

interface IPositionManager {

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        int256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee
    );

    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        int256 pnl,
        bool needADL,
        uint256 tradingFee,
        int256 fundingFee
    );

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

    event UpdateMaxTimeDelay(uint256 oldDelay, uint256 newDelay);

    function updateMaxTimeDelay(uint256 _maxTimeDelay) external;

    function executeIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;

    function executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;

    function liquidatePositions(bytes32[] memory _positionKeys) external;

    function executeADLAndDecreaseOrder(
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType
    ) external;
}
