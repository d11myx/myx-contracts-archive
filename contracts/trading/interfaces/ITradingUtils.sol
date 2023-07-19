// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./ITradingRouter.sol";

interface ITradingUtils {
//    enum TradeType {MARKET, LIMIT, TP, SL}

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);

    function getOrderKey(bool _isIncrease, ITradingRouter.TradeType _tradeType, uint256 _orderId) external pure returns (bytes32);

    function getPrice(uint256 _pairIndex, bool _isLong) external view returns (uint256);

    function validLeverage(bytes32 key, int256 _collateral, uint256 _sizeAmount, bool _increase) external;

}
