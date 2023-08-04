// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IExecutor {

    event UpdateExecuteRouter(address oldAddress, address newAddress);

//    function updateExecuteRouter(IExecuteRouter _executeRouter) external;
//
//    function setPricesAndExecuteMarketOrders(
//        address[] memory _tokens,
//        uint256[] memory _prices,
//        uint256 _timestamp,
//        uint256 _increaseEndIndex,
//        uint256 _decreaseEndIndex
//    ) external;
//
//    function setPricesAndExecuteLimitOrders(
//        address[] memory _tokens,
//        uint256[] memory _prices,
//        uint256 _timestamp,
//        uint256[] memory _increaseOrderIds,
//        uint256[] memory _decreaseOrderIds
//    ) external;
//
//    function executeIncreaseMarketOrders(uint256 _endIndex) external;
//
//    function executeIncreaseLimitOrders(uint256[] memory _orderIds) external;
//
//    function executeIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
//
//
//    function executeDecreaseMarketOrders(uint256 _endIndex) external;
//
//    function executeDecreaseLimitOrders(uint256[] memory _orderIds) external;
//
//    function executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
//
//    function setPricesAndLiquidatePositions(
//        address[] memory _tokens,
//        uint256[] memory _prices,
//        uint256 _timestamp,
//        bytes32[] memory _positionKeys
//    ) external;
//
//    function liquidatePositions(bytes32[] memory _positionKeys) external;
//
//    function setPricesAndExecuteADL(
//        address[] memory _tokens,
//        uint256[] memory _prices,
//        uint256 _timestamp,
//        bytes32[] memory _positionKeys,
//        uint256[] memory _sizeAmounts,
//        uint256 _orderId,
//        TradingTypes.TradeType _tradeType
//    ) external;
//
//    function executeADLAndDecreaseOrder(
//        bytes32[] memory _positionKeys,
//        uint256[] memory _sizeAmounts,
//        uint256 _orderId,
//        TradingTypes.TradeType _tradeType
//    ) external;

}
