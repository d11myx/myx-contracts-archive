// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import '../libraries/Position.sol';

enum PositionStatus {
    Balance,
    NetLong,
    NetShort
}

interface IPositionManager {
    event UpdateFundingInterval(uint256 oldInterval, uint256 newInterval);

    event UpdatePosition(
        address account,
        bytes32 positionKey,
        uint256 pairIndex,
        bool isLong,
        uint256 beforCollateral,
        uint256 afterCollateral,
        uint256 price,
        uint256 beforPositionAmount,
        uint256 afterPositionAmount,
        uint256 averagePrice,
        int256 fundFeeTracker,
        int256 pnl
    );

    event UpdateFundingRate(uint256 pairIndex, uint price, int256 fundingRate, uint256 lastFundingTime);

    event TakeFundingFeeAddTraderFee(
        address account,
        uint256 pairIndex,
        uint256 sizeDelta,
        uint256 tradingFee,
        int256 fundingFee,
        uint256 lpTradingFee
    );

    function getExposedPositions(uint256 pairIndex) external view returns (int256);

    function longTracker(uint256 pairIndex) external view returns (uint256);

    function shortTracker(uint256 pairIndex) external view returns (uint256);

    function getTradingFee(
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) external view returns (uint256 tradingFee);

    function getFundingFee(address _account, uint256 _pairIndex, bool _isLong) external view returns (int256);

    function getCurrentFundingRate(uint256 _pairIndex) external view returns (int256);

    function getPosition(
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) external view returns (Position.Info memory);

    function getPositionByKey(bytes32 key) external view returns (Position.Info memory);

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);

    function updateFundingInterval(uint256 newInterval) external;

    function increasePosition(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        int256 _collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 _price
    ) external returns (uint256 tradingFee, int256 fundingFee);

    function decreasePosition(
        uint256 _pairIndex,
        address _account,
        address _keeper,
        uint256 _sizeAmount,
        bool _isLong,
        int256 _collateral,
        uint256 vipRate,
        uint256 referenceRate,
        uint256 _price
    ) external returns (uint256 tradingFee, int256 fundingFee, int256 pnl);

    function updateFundingRate(uint256 _pairIndex) external;
}
