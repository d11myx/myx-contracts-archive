pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import '../interfaces/IPool.sol';
import '../interfaces/IFeeManager.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';


contract FeeManager is ReentrancyGuard, IFeeManager, Roleable {
    using PrecisionUtils for uint256;
    mapping(address => uint256) public override stakingTradingFee;
    mapping(address => uint256) public override distributorTradingFee;
    mapping(address => mapping(address => uint256)) public override keeperTradingFee;

    IPool public pool;

    constructor(IAddressesProvider addressProvider) Roleable(addressProvider) {}

    function claimStakingTradingFee(address claimToken) external nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableStakingTradingFee = stakingTradingFee[claimToken];
        if (claimableStakingTradingFee > 0) {
            // pool.transferTokenTo(claimToken, msg.sender, claimableStakingTradingFee);
            //            IERC20(claimToken).safeTransfer(msg.sender, claimableStakingTradingFee);
            delete stakingTradingFee[claimToken];
        }
        return claimableStakingTradingFee;
    }

    function claimDistributorTradingFee(address claimToken) external nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableDistributorTradingFee = distributorTradingFee[claimToken];
        if (claimableDistributorTradingFee > 0) {
            // pool.transferTokenTo(claimToken, msg.sender, claimableDistributorTradingFee);
            //            IERC20(claimToken).safeTransfer(msg.sender, claimableDistributorTradingFee);
            delete distributorTradingFee[claimToken];
        }
        return claimableDistributorTradingFee;
    }

    function claimKeeperTradingFee(address claimToken, address keeper) external nonReentrant returns (uint256) {
        uint256 claimableKeeperTradingFee = keeperTradingFee[claimToken][keeper];
        if (claimableKeeperTradingFee > 0) {
            // pool.transferTokenTo(claimToken, keeper, claimableKeeperTradingFee);
            //            IERC20(claimToken).safeTransfer(keeper, claimableKeeperTradingFee);
            delete keeperTradingFee[claimToken][keeper];
        }
        return claimableKeeperTradingFee;
    }

    function _distributeTradingFee(
        address account,
        IPool.Pair memory pair,
        uint256 tradingFee,
        address keeper
    ) internal {
        // console.log('distributeTradingFee tradingFee', tradingFee, 'keeper', keeper);
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);

        uint256 lpAmount = tradingFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        //        IERC20(pair.stableToken).safeTransfer(address(pool), lpAmount);
        pool.increaseTotalAmount(pair.pairIndex, 0, lpAmount);

        uint256 keeperAmount = tradingFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        uint256 stakingAmount = tradingFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        uint256 distributorAmount = tradingFee - keeperAmount - stakingAmount;

        keeperTradingFee[pair.stableToken][keeper] += keeperAmount;
        stakingTradingFee[pair.stableToken] += stakingAmount;
        distributorTradingFee[pair.stableToken] += distributorAmount;
        // console.log(
        //     'distributeTradingFee lpAmount %s keeperAmount %s stakingAmount %s',
        //     lpAmount,
        //     keeperAmount,
        //     stakingAmount
        // );

        emit DistributeTradingFee(account, pair.pairIndex, lpAmount, keeperAmount, stakingAmount, distributorAmount);
    }
}
