// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/TradingTypes.sol";

interface IRouter {
    struct AddOrderTpSlRequest {
        uint256 orderId;
        TradingTypes.TradeType tradeType;
        bool isIncrease;
        uint256 tpPrice; // Stop profit price 1e30
        uint128 tp; // The number of profit stops
        uint256 slPrice; // Stop price 1e30
        uint128 sl; // Stop loss quantity
        TradingTypes.NetworkFeePaymentType paymentType;
    }

    struct CancelOrderRequest {
        uint256 orderId;
        TradingTypes.TradeType tradeType;
        bool isIncrease;
    }

    event UpdateTradingRouter(address oldAddress, address newAddress);
}
