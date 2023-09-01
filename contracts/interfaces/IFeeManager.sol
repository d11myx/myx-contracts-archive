pragma solidity 0.8.20;

interface IFeeManager {
    event DistributeTradingFee(
        address account,
        uint256 pairIndex,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 referenceAmount,
        uint256 lpAmount,
        uint256 keeperAmount,
        uint256 stakingAmount,
        uint256 distributorAmount
    );

    event ClaimedStakingTradingFee(address account, address claimToken, uint256 amount);
    event ClaimedDistributorTradingFee(address account, address claimToken, uint256 amount);
    event ClaimedReferralsTradingFee(address account, address claimToken, uint256 amount);
    event ClaimedUserTradingFee(address account, address claimToken, uint256 amount);

    function stakingTradingFee() external view returns (uint256);

    function treasuryFee() external view returns (uint256);

    function userTradingFee(address _account) external view returns (uint256);

    // function referralsTradingFee() external view returns (uint256);

    // function claimReferralsTradingFee(address claimToken) external returns (uint256);

    function claimStakingTradingFee() external returns (uint256);

    function claimTreauryFee() external returns (uint256);

    function claimKeeperTradingFee() external returns (uint256);

    function claimUserTradingFee() external returns (uint256);
}
