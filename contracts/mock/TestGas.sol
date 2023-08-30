pragma solidity 0.8.17;

import '../libraries/TradingTypes.sol';

contract TestGas {
    struct Info {
        uint256 collateral;
        uint256 positionAmount;
        uint256 averagePrice;
    }
    uint256 public key;
    mapping(address => uint256) keys;
    mapping(address => TradingTypes.IncreasePositionRequest) keyPositionRequests;
    mapping(address => TradingTypes.OrderWithTpSl) keyOrderWithTpSl;
    Info[] infos;

    address public owner;

    mapping(uint256 => int256) public uint256Tests;
    mapping(uint32 => int256) public uint32Tests;

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

    function saveInfos() external {
        infos = [Info({collateral: 0, positionAmount: 0, averagePrice: 0})];
    }

    function saveUint256Tests() external {
        uint256Tests[1] = 1;
    }

    function saveUint32Tests() external {
        uint32Tests[1] = 1;
    }
}
