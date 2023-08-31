pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import {PositionStatus, IPositionManager} from '../interfaces/IPositionManager.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IFeeManager.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import './FeeCollector.sol';

abstract contract FeeManager is ReentrancyGuard, IFeeManager, IPositionManager, Roleable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;

    uint256 public override stakingTradingFee;

    mapping(address => uint256) public override userTradingFee;
    //user +keeper
    // uint256 public override referralsTradingFee;
    uint256 public override distributorTradingFee;

    IPool public immutable pool;
    IFeeCollector public immutable feeCollector;
    address public immutable pledgeAddress;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pool,
        address _pledgeAddress,
        IFeeCollector _feeCollector
    ) Roleable(addressProvider) {
        pledgeAddress = _pledgeAddress;
        pool = _pool;
        feeCollector = _feeCollector;
    }

    function claimStakingTradingFee(address claimToken) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableStakingTradingFee = stakingTradingFee;
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableStakingTradingFee);
            stakingTradingFee = 0;
        }
        emit ClaimedStakingTradingFee(msg.sender, claimToken, claimableStakingTradingFee);
        return claimableStakingTradingFee;
    }

    function claimDistributorTradingFee(
        address claimToken
    ) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableDistributorTradingFee = distributorTradingFee;
        if (claimableDistributorTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableDistributorTradingFee);
            distributorTradingFee = 0;
        }
        emit ClaimedDistributorTradingFee(msg.sender, claimToken, claimableDistributorTradingFee);
        return claimableDistributorTradingFee;
    }

    // function claimReferralsTradingFee(
    //     address claimToken
    // ) external override nonReentrant onlyPoolAdmin returns (uint256) {
    //     uint256 claimableReferralsTradingFee = referralsTradingFee;
    //     if (claimableReferralsTradingFee > 0) {
    //         pool.transferTokenTo(claimToken, msg.sender, claimableReferralsTradingFee);
    //         referralsTradingFee = 0;
    //     }
    //     emit ClaimedReferralsTradingFee(msg.sender, claimToken, claimableReferralsTradingFee);
    //     return claimableReferralsTradingFee;
    // }

    function claimKeeperTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function claimUserTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function _claimUserTradingFee(address claimToken) internal returns (uint256) {
        uint256 claimableUserTradingFee = userTradingFee[msg.sender];
        if (claimableUserTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableUserTradingFee);
            IERC20(claimToken).safeTransfer(msg.sender, claimableUserTradingFee);
            userTradingFee[msg.sender] = 0;
        }
        emit ClaimedUserTradingFee(msg.sender, claimToken, claimableUserTradingFee);
        return claimableUserTradingFee;
    }

    function _distributeTradingFee(
        IPool.Pair memory pair,
        address account,
        address keeper,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 vipRate,
        uint256 referenceRate
    ) internal {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);

        uint256 vipAmount = tradingFee.mulPercentage(vipRate);
        userTradingFee[account] += vipAmount;

        uint256 surplusFee = tradingFee - vipAmount;

        uint256 referralsAmount = surplusFee.mulPercentage(Math.min(referenceRate, feeCollector.maxReferralsRatio()));
        distributorTradingFee += referralsAmount;

        uint256 lpAmount = surplusFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.increaseLPProfit(pair.pairIndex, lpAmount);

        uint256 keeperAmount = surplusFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        userTradingFee[keeper] += keeperAmount;

        uint256 stakingAmount = surplusFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        stakingTradingFee += stakingAmount;

        uint256 distributorAmount = surplusFee - referralsAmount - lpAmount - keeperAmount - stakingAmount;
        distributorTradingFee += distributorAmount;

        emit DistributeTradingFee(
            account,
            pair.pairIndex,
            sizeDelta,
            tradingFee,
            referralsAmount,
            lpAmount,
            keeperAmount,
            stakingAmount,
            distributorAmount
        );
    }
}
