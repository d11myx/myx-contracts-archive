// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface ITradingVault {
    function isFrozen(address account) external view returns(bool);
    function netExposureAmountChecker(uint256 _pairIndex) external view returns(int256);
    function longShortTracker(uint256 _pairIndex) external view returns(int256);
    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _collateral,
        uint256 _sizeDelta,
        bool _isLong
    ) external;
}
