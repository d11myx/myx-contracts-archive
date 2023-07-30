// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface ITradingVault {
    struct Position {
        bytes32 key;
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
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong,
        uint256 _price
    ) external returns (uint256 tradingFee, int256 fundingFee);

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong,
        uint256 _price
    ) external returns (uint256 tradingFee, int256 fundingFee, int256 pnl);

    function getPosition(address _account, uint256 _pairIndex, bool _isLong) external view returns (Position memory);

    function getPositionByKey(bytes32 key) external view returns (Position memory);

    function getTradingFee(uint256 _pairIndex, bool _isLong, uint256 _sizeAmount) external view returns (uint256 tradingFee);

    function getFundingFee(bool _increase, address _account, uint256 _pairIndex, bool _isLong, uint256 _sizeAmount) external view returns (int256);

    function getCurrentFundingRate(uint256 _pairIndex) external view returns (int256);

    function isFrozen(address _account) external view returns (bool);

    function netExposureAmountChecker(uint256 _pairIndex) external view returns (int256);

    function longTracker(uint256 _pairIndex) external view returns (uint256);

    function shortTracker(uint256 _pairIndex) external view returns (uint256);

}
