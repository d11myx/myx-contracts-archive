// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../../libraries/type/TradingTypes.sol";

interface ITradingRouter {


    event CreateIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradingTypes.TradeType tradeType,
        int256 collateral,
        uint256 openPrice,
        bool isLong,
        uint256 sizeAmount,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
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


    function getIncreaseMarketOrder(uint256 index) external view returns(TradingTypes.IncreasePositionOrder memory);
    function getDecreaseMarketOrder(uint256 index) external view returns(TradingTypes.DecreasePositionOrder memory);
    function increaseMarketOrdersIndex() external view returns (uint256);
    function decreaseMarketOrdersIndex() external view returns (uint256);
    function increaseMarketOrderStartIndex() external view returns (uint256);
    function decreaseMarketOrderStartIndex() external view returns (uint256);
    function getIncreaseLimitOrder(uint256 index) external view returns(TradingTypes.IncreasePositionOrder memory);
    function getDecreaseLimitOrder(uint256 index) external view returns(TradingTypes.DecreasePositionOrder memory);
    function increaseLimitOrdersIndex() external view returns (uint256);
    function decreaseLimitOrdersIndex() external view returns (uint256);

    function positionHasTpSl(bytes32 positionKey, TradingTypes.TradeType tradeType) external view returns (bool);

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) external returns (uint256 orderId);
    function cancelIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) external returns (uint256 orderId);
    function cancelDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external;
    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external;
    function cancelOrders(address account, uint256 pairIndex, bool isLong, bool isIncrease) external;

    function createTpSl(TradingTypes.CreateTpSlRequest memory _request) external returns (uint256 tpOrderId, uint256 slOrderId);

    function getIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external view returns (TradingTypes.IncreasePositionOrder memory order);
    function getDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external view returns (TradingTypes.DecreasePositionOrder memory order);

    function getPositionOrders(bytes32 key) external view returns (TradingTypes.PositionOrder[] memory orders);

    function addOrderToPosition(TradingTypes.PositionOrder memory _order) external;
    function removeOrderFromPosition(TradingTypes.PositionOrder memory _order) external;
    function setIncreaseMarketOrderStartIndex(uint256 index) external;
    function setDecreaseMarketOrderStartIndex(uint256 index) external;
    function setPositionHasTpSl(bytes32 key, TradingTypes.TradeType tradeType, bool has) external;

    function removeFromIncreaseMarketOrders(uint256 orderId) external;
    function removeFromIncreaseLimitOrders(uint256 orderId) external;
    function removeFromDecreaseMarketOrders(uint256 orderId) external;
    function removeFromDecreaseLimitOrders(uint256 orderId) external;
    function transferToVault(address token, uint256 amount) external;
    function setOrderNeedADL(uint256 _orderId, TradingTypes.TradeType _tradeType, bool _needADL) external;

    function saveIncreaseMarketOrder(TradingTypes.IncreasePositionOrder memory order) external;
    function saveIncreaseLimitOrder(TradingTypes.IncreasePositionOrder memory order) external;

    function saveDecreaseMarketOrder(TradingTypes.DecreasePositionOrder memory order) external;
    function saveDecreaseLimitOrder(TradingTypes.DecreasePositionOrder memory order) external;
}
