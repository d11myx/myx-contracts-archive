// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface CallbacksInterfaceV5{
    struct AggregatorAnswer{
        uint order;
        uint price;
        uint spreadP;
    }
    function openTradeMarketCallback(AggregatorAnswer memory) external;
    function closeTradeMarketCallback(AggregatorAnswer memory) external;
    function executeNftOpenOrderCallback(AggregatorAnswer memory) external;
    function executeNftCloseOrderCallback(AggregatorAnswer memory) external;
}