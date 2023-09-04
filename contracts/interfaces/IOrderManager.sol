// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../libraries/TradingTypes.sol';

interface IOrderManager {
    event UpdatePositionManager(address oldAddress, address newAddress);
    event CancelOrder(uint256 orderId, TradingTypes.TradeType tradeType, string reason);

    event CreateIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        int256 collateral,
        uint256 openPrice,
        bool isLong,
        uint256 sizeAmount
    );

    event CreateDecreaseOrder(
        address account,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        int256 collateral,
        uint256 pairIndex,
        uint256 openPrice,
        uint256 sizeAmount,
        bool isLong,
        bool abovePrice
    );

    event CancelIncreaseOrder(address account, uint256 orderId, TradingTypes.TradeType tradeType);
    event CancelDecreaseOrder(address account, uint256 orderId, TradingTypes.TradeType tradeType);

    struct PositionOrder {
        address account;
        uint256 pairIndex;
        bool isLong;
        bool isIncrease;
        TradingTypes.TradeType tradeType;
        uint256 orderId;
        uint256 sizeAmount;
    }

    function ordersIndex() external view returns (uint256);

    function getOrderTpSl(uint256 orderKey) external view returns (TradingTypes.OrderWithTpSl memory);

    function getPositionOrders(bytes32 key) external view returns (PositionOrder[] memory);

    function createOrder(TradingTypes.CreateOrderRequest memory request) external returns (uint256 orderId);

    function cancelOrder(uint256 orderId, TradingTypes.TradeType tradeType, bool isIncrease, string memory reason) external;

    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external;

    function getIncreaseOrder(
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external view returns (TradingTypes.IncreasePositionOrder memory order);

    function getDecreaseOrder(
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external view returns (TradingTypes.DecreasePositionOrder memory order);

    function addOrderToPosition(PositionOrder memory order) external;

    function removeOrderFromPosition(PositionOrder memory order) external;

    function removeIncreaseMarketOrders(uint256 orderId) external;

    function removeIncreaseLimitOrders(uint256 orderId) external;

    function removeDecreaseMarketOrders(uint256 orderId) external;

    function removeDecreaseLimitOrders(uint256 orderId) external;

    function setOrderNeedADL(uint256 orderId, TradingTypes.TradeType tradeType, bool needADL) external;

    function saveOrderTpSl(uint256 orderKey, TradingTypes.OrderWithTpSl memory tpSl) external;

    function removeOrderTpSl(uint256 orderKey) external;
}
