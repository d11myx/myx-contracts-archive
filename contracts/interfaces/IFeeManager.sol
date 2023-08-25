pragma solidity 0.8.17;

interface IFeeManager {
    event DistributeTradingFee(
        address account,
        uint256 pairIndex,
        uint256 lpAmount,
        uint256 keeperAmount,
        uint256 stakingAmount,
        uint256 distributorAmount
    );

    function stakingTradingFee(address _token) external view returns (uint256);

    function distributorTradingFee(address _token) external view returns (uint256);

    function keeperTradingFee(address _token, address _account) external view returns (uint256);


    function claimStakingTradingFee(address claimToken) external returns (uint256);

    function claimDistributorTradingFee(address claimToken) external returns (uint256);

    function claimKeeperTradingFee(address claimToken, address keeper) external returns (uint256);

}
