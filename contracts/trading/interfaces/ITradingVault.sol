// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface ITradingVault {
    struct Position {
        address account;
        uint256 pairIndex;
        bool isLong;
        uint256 collateral;
        uint256 positionAmount;
        uint256 averagePrice;
        uint256 entryFundingRate;
        int256 releasedPnl;
    }
    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);
    function getPosition(address _account, uint256 _pairIndex, bool _isLong) external view returns(Position memory);
    function isFrozen(address _account) external view returns(bool);
    function netExposureAmountChecker(uint256 _pairIndex) external view returns(int256);
    function longShortTracker(uint256 _pairIndex) external view returns(int256);
    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _collateral,
        uint256 _sizeAmount,
        bool _isLong
    ) external;
    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _sizeAmount,
        bool _isLong
    ) external;
}
