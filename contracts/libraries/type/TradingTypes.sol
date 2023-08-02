// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

library TradingTypes {

    enum TradeType {MARKET, LIMIT, TP, SL}

    struct CreateOrderRequest {
        address account;
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        int256 collateral;             // 1e18 保证金数量，负数表示减仓
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        int256 sizeAmount;            // 仓位数量
    }

    struct IncreasePositionRequest {
        address account;
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        int256 collateral;             // 1e18 保证金数量，负数表示减仓
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        uint256 sizeAmount;            // 仓位数量
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
    }

    struct DecreasePositionRequest {
        address account;
        uint256 pairIndex;
        TradeType tradeType;
        int256 collateral;             // 1e18 保证金数量，负数表示减仓
        uint256 triggerPrice;          // 限价触发价格
        uint256 sizeAmount;            // 关单数量
        bool isLong;
    }

    struct CreateTpSlRequest {
        address account;
        uint256 pairIndex;             // 币对index
        bool isLong;
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
    }

    struct IncreasePositionOrder {
        uint256 orderId;
        address account;
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        int256 collateral;             // 1e18 保证金数量
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        uint256 sizeAmount;            // 仓位数量
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
        uint256 blockTime;
    }

    struct DecreasePositionOrder {
        uint256 orderId;
        address account;
        uint256 pairIndex;
        TradeType tradeType;
        int256 collateral;             // 1e18 保证金数量
        uint256 triggerPrice;           // 限价触发价格
        uint256 sizeAmount;             // 关单数量
        bool isLong;
        bool abovePrice;                // 高于或低于触发价格
        // 市价单：开多 true 空 false
        // 限价单：开多 false 空 true
        // 止盈：多单 false 空单 true
        // 止损：多单 true 空单 false
        uint256 blockTime;
        bool needADL;
    }

    struct PositionOrder {
        address account;
        uint256 pairIndex;
        bool isLong;
        bool isIncrease;
        TradeType tradeType;
        uint256 orderId;
        uint256 sizeAmount;
    }
}
