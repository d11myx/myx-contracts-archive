// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface IPairVault {
    struct Vault {
        uint256 indexTotalAmount;               // total amount of tokens
        uint256 indexReservedAmount;            // amount of tokens reserved for open positions
        uint256 stableTotalAmount;
        uint256 stableReservedAmount;
        uint256 averageLpLongPrice;
        uint256 averageLpShortPrice;
        int256 unrealisedPnl;
        int256 realisedPnl;
    }

    function getVault(uint256 _pairIndex) external view returns(Vault memory vault);
    function increaseTotalAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;
    function decreaseTotalAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;
    function increaseReserveAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;
    function decreaseReserveAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;
    function transferTokenTo(address token, address to, uint256 amount) external;
}
