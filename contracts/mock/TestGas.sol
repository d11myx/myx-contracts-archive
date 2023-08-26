pragma solidity 0.8.17;

import '../libraries/TradingTypes.sol';

contract TestGas {
    uint256 public key;
    mapping(address => uint256) keys;
    mapping(address => TradingTypes.IncreasePositionRequest) keyStructs;

    address public owner;

    function testKey(uint256 i) external {
        key = i;
    }

    function testKeys(uint256 i) external {
        keys[owner] = i;
    }

    function saveStruct() external {
        keyStructs[owner] = TradingTypes.IncreasePositionRequest({
            account: msg.sender,
            pairIndex: 1,
            tradeType: TradingTypes.TradeType.LIMIT,
            collateral: 1,
            openPrice: 3000,
            isLong: true,
            sizeAmount: 1000
        });
    }
}
