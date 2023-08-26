pragma solidity 0.8.17;

import '../libraries/TradingTypes.sol';

contract TestGas {
    uint256 public key;
    mapping(address => uint256) keys;
    mapping(address => TradingTypes.IncreasePositionRequest) keyPositionRequests;
    mapping(address => TradingTypes.OrderWithTpSl) keyOrderWithTpSl;

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function testKey(uint256 i) external {
        key = i;
    }

    function testKeys(uint256 i) external {
        keys[owner] = i;
    }

    function saveIncreasePosit() external {
        keyPositionRequests[owner] = TradingTypes.IncreasePositionRequest({
            account: msg.sender,
            pairIndex: 1,
            tradeType: TradingTypes.TradeType.LIMIT,
            collateral: 1,
            openPrice: 3000,
            isLong: true,
            sizeAmount: 1000
        });
    }

    function saveOrderWithTpSl() external {
        keyOrderWithTpSl[owner] = TradingTypes.OrderWithTpSl({tpPrice: 1000, tp: 1, slPrice: 1000, sl: 1});
    }
}
