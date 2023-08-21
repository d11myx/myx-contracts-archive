pragma solidity 0.8.17;

contract TestGas {
    uint256 public key;
    mapping(address => uint256) keys;

    address public owner;

    function testKey(uint256 i) external {
        key = i;
    }

    function testKeys(uint256 i) external {
        keys[owner] = i;
    }
}
