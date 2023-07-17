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
        int256 entryFundingRate;
        uint256 entryFundingTime;
        int256 realisedPnl;
    }

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
    ) external returns(int256 pnl);

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);
    function getPosition(address _account, uint256 _pairIndex, bool _isLong) external view returns(Position memory);
    function getPositionByKey(bytes32 key) external view returns(Position memory);
    function getFundingFee(bool _increase, uint256 _pairIndex, uint256 _sizeAmount, uint256 _positionAmount, int256 _entryFundingRate, uint256 _entryFundingTime) external view returns (int256);
    function getCurrentFundingRate(uint256 _pairIndex) external view returns (int256);
    function isFrozen(address _account) external view returns(bool);
    function netExposureAmountChecker(uint256 _pairIndex) external view returns(int256);
    function longTracker(uint256 _pairIndex) external view returns(uint256);
    function shortTracker(uint256 _pairIndex) external view returns(uint256);

}
