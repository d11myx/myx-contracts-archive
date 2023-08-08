// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '../libraries/Position.sol';

interface ITradingVault {

    event UpdatePairInfo(address oldPairInfo, address newPairInfo);

    event UpdatePairVault(address oldPairVault, address newPairVault);

    event UpdateTradingFeeReceiver(address oldReceiver, address newReceiver);

    event UpdateFundingInterval(uint256 oldInterval, uint256 newInterval);

    event IncreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        int256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee,
        uint256 transferOut
    );

    event DecreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        int256 collateral,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee,
        int256 realisedPnl,
        uint256 transferOut
    );

    event UpdatePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 positionAmount,
        uint256 averagePrice,
        int256 entryFundingRate,
        uint256 entryFundingTime,
        int256 realisedPnl,
        uint256 price
    );

    event ClosePosition(bytes32 positionKey, address account, uint256 pairIndex, bool isLong);

    event UpdateFundingRate(uint256 pairIndex, int256 fundingRate, uint256 lastFundingTime);

    event NeedBuyIndexToken(uint256 pairIndex, uint256 profit, uint256 lastFundingTime);

    function isFrozen(address account) external view returns (bool);

    function netExposureAmountChecker(uint256 pairIndex) external view returns (int256);

    function longTracker(uint256 pairIndex) external view returns (uint256);

    function shortTracker(uint256 pairIndex) external view returns (uint256);

     function getTradingFee(uint256 _pairIndex, bool _isLong, uint256 _sizeAmount) external view returns (uint256 tradingFee);

    function getFundingFee(
        bool _increase,
        address _account,
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) external view returns (int256);

    function getCurrentFundingRate(uint256 _pairIndex) external view returns (int256);

    function getPosition(address _account, uint256 _pairIndex, bool _isLong) external view returns (Position.Info memory);

    function getPositionByKey(bytes32 key) external view returns (Position.Info memory);

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) external pure returns (bytes32);

    function updatePairInfo(address newPairInfo) external;

    function updatePairVault(address newPairVault) external;

    function updateTradingFeeReceiver(address newReceiver) external;

    function updateFundingInterval(uint256 newInterval) external;

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

    function updateCumulativeFundingRate(uint256 _pairIndex, uint256 _price) external;



}
