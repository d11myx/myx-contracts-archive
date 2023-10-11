// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IPool.sol";

interface IFeeCollector {

    event UpdateLevelDiscountRatio(
        uint8 level,
        uint256 oldMakerDiscountRatio,
        uint256 oldTakerDiscountRatio,
        uint256 newMakerDiscountRatio,
        uint256 newtakerDiscountRatio
    );

    event UpdateMaxReferralsRatio(uint256 oldRatio, uint256 newRatio);

    event UpdatedStakingPoolAddress(address sender, address oldAddress, address newAddress);

    event DistributeTradingFee(
        address account,
        uint256 pairIndex,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 vipAmount,
        uint256 vipRate,
        uint256 referralAmount,
        uint256 lpAmount,
        uint256 keeperAmount,
        uint256 stakingAmount,
        uint256 distributorAmount
    );

    event ClaimedStakingTradingFee(address account, address claimToken, uint256 amount);

    event ClaimedDistributorTradingFee(address account, address claimToken, uint256 amount);

    event ClaimedReferralsTradingFee(address account, address claimToken, uint256 amount);

    event ClaimedUserTradingFee(address account, address claimToken, uint256 amount);

    struct LevelDiscount {
        uint256 makerDiscountRatio;
        uint256 takerDiscountRatio;
    }

    function maxReferralsRatio() external view returns (uint256 maxReferenceRatio);

    function stakingTradingFee() external view returns (uint256);

    function treasuryFee() external view returns (uint256);

    function userTradingFee(address _account) external view returns (uint256);

    function getLevelDiscounts(uint8 level) external view returns (LevelDiscount memory);

    function updateLevelDiscountRatio(uint8 level, LevelDiscount memory newRatio) external;

    function updateMaxReferralsRatio(uint256 newRatio) external;

    function claimStakingTradingFee() external returns (uint256);

    function claimTreasuryFee() external returns (uint256);

    function claimKeeperTradingFee() external returns (uint256);

    function claimUserTradingFee() external returns (uint256);

    function distributeTradingFee(
        IPool.Pair memory pair,
        address account,
        address keeper,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 vipRate,
        uint256 referralRate
    ) external returns (uint256 lpAmount);
}
