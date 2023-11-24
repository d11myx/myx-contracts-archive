// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library TradingTypes {
    enum TradeType {
        MARKET,
        LIMIT,
        TP,
        SL
    }

    enum FeePaymentType {
        ETH,
        COLLATERAL
    }

    struct CreateOrderRequest {
        address account;
        uint256 pairIndex; // pair index
        TradeType tradeType; // 0: MARKET, 1: LIMIT 2: TP 3: SL
        int256 collateral; // 1e18 collateral amount，negative number is withdrawal
        uint256 openPrice; // 1e30, price
        bool isLong; // long or short
        int256 sizeAmount; // size
        uint256 maxSlippage;
        bytes data;
    }

    struct OrderWithTpSl {
        uint256 tpPrice; // 1e30, tp price
        uint256 tp; // tp size
        uint256 slPrice; // 1e30, sl price
        uint256 sl; // sl size
    }

    struct IncreasePositionRequest {
        address account;
        uint256 pairIndex; // pair index
        TradeType tradeType; // 0: MARKET, 1: LIMIT 2: TP 3: SL
        int256 collateral; // 1e18 collateral amount，negative number is withdrawal
        uint256 openPrice; // 1e30, price
        bool isLong; // long or short
        uint256 sizeAmount; // size
        uint256 maxSlippage;
    }

    struct IncreasePositionWithTpSlRequest {
        address account;
        uint256 pairIndex; // pair index
        TradeType tradeType; // 0: MARKET, 1: LIMIT 2: TP 3: SL
        int256 collateral; // 1e18 collateral amount，negative number is withdrawal
        uint256 openPrice; // 1e30, price
        bool isLong; // long or short
        uint256 sizeAmount; // size
        uint256 tpPrice; // 1e30, tp price
        uint256 tp; // tp size
        uint256 slPrice; // 1e30, sl price
        uint256 sl; // sl size
        uint256 maxSlippage;
        FeePaymentType feePaymentType; // 0: eth 1: collateral
    }

    struct DecreasePositionRequest {
        address account;
        uint256 pairIndex;
        TradeType tradeType;
        int256 collateral; // 1e18 collateral amount，negative number is withdrawal
        uint256 triggerPrice; // 1e30, price
        uint256 sizeAmount; // size
        bool isLong;
        uint256 maxSlippage;
    }

    struct CreateTpSlRequest {
        address account;
        uint256 pairIndex; // pair index
        bool isLong;
        uint256 tpPrice; // Stop profit price 1e30
        uint256 tp; // The number of profit stops
        uint256 slPrice; // Stop price 1e30
        uint256 sl; // Stop loss quantity
    }

    struct IncreasePositionOrder {
        uint256 orderId;
        address account;
        uint256 pairIndex; // pair index
        TradeType tradeType; // 0: MARKET, 1: LIMIT
        int256 collateral; // 1e18 Margin amount
        uint256 openPrice; // 1e30 Market acceptable price/Limit opening price
        bool isLong; // Long/short
        uint256 sizeAmount; // Number of positions
        uint256 executedSize;
        uint256 maxSlippage;
        uint256 blockTime;
    }

    struct DecreasePositionOrder {
        uint256 orderId;
        address account;
        uint256 pairIndex;
        TradeType tradeType;
        int256 collateral; // 1e18 Margin amount
        uint256 triggerPrice; // Limit trigger price
        uint256 sizeAmount; // Number of customs documents
        uint256 executedSize;
        uint256 maxSlippage;
        bool isLong;
        bool abovePrice; // Above or below the trigger price
        // market：long: true,  short: false
        //  limit：long: false, short: true
        //     tp：long: false, short: true
        //     sl：long: true,  short: false
        uint256 blockTime;
        bool needADL;
    }
}
