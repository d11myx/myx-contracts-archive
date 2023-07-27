// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./ITradingRouter.sol";

interface ITradingUtils {

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);
    function getOrderKey(bool _isIncrease, ITradingRouter.TradeType _tradeType, uint256 _orderId) external pure returns (bytes32);
    function getPrice(uint256 _pairIndex, bool _isLong) external view returns (uint256);
    function getValidPrice(uint256 _pairIndex, bool _isLong) external view returns (uint256);
    function getUnrealizedPnl(address _account, uint256 _pairIndex, bool _isLong, uint256 _sizeAmount) external view returns (int256 pnl);
    function validLeverage(address account, uint256 pairIndex, bool isLong, int256 _collateral, uint256 _sizeAmount, bool _increase) external;

}
