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

    mapping(address => uint256) public override stakingTradingFee;

    mapping(address => mapping(address => uint256)) public override userTradingFee;
    //user +keeper
    mapping(address => uint256) public override referralsTradingFee;
    mapping(address => uint256) public override distributorTradingFee;

    IPool public immutable pool;
    IFeeCollector public immutable feeCollector;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pool,
        IFeeCollector _feeCollector
    ) Roleable(addressProvider) {
        pool = _pool;
        feeCollector = _feeCollector;
    }

    function claimStakingTradingFee(address claimToken) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableStakingTradingFee = stakingTradingFee[claimToken];
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableStakingTradingFee);
            stakingTradingFee[claimToken] = 0;
        }
        emit ClaimedStakingTradingFee(msg.sender, claimToken, claimableStakingTradingFee);
        return claimableStakingTradingFee;
    }

    function claimDistributorTradingFee(
        address claimToken
    ) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableDistributorTradingFee = distributorTradingFee[claimToken];
        if (claimableDistributorTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableDistributorTradingFee);
            distributorTradingFee[claimToken] = 0;
        }
        emit ClaimedDistributorTradingFee(msg.sender, claimToken, claimableDistributorTradingFee);
        return claimableDistributorTradingFee;
    }

    function claimReferralsTradingFee(
        address claimToken
    ) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableReferralsTradingFee = referralsTradingFee[claimToken];
        if (claimableReferralsTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableReferralsTradingFee);
            referralsTradingFee[claimToken] = 0;
        }
        emit ClaimedReferralsTradingFee(msg.sender, claimToken, claimableReferralsTradingFee);
        return claimableReferralsTradingFee;
    }

    function claimKeeperTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function claimUserTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function _claimUserTradingFee(address claimToken) internal returns (uint256) {
        uint256 claimableUserTradingFee = userTradingFee[claimToken][msg.sender];
        if (claimableUserTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableUserTradingFee);
            IERC20(claimToken).safeTransfer(msg.sender, claimableUserTradingFee);
            userTradingFee[claimToken][msg.sender] = 0;
        }
        emit ClaimedUserTradingFee(msg.sender, claimToken, claimableUserTradingFee);
        return claimableUserTradingFee;
    }

    function _updateFee(
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
        userTradingFee[pair.stableToken][account] += vipAmount;

        uint256 surplusFee = tradingFee - vipAmount;

        uint256 referralsAmount = surplusFee.mulPercentage(Math.min(referenceRate, feeCollector.maxReferralsRatio()));
        referralsTradingFee[pair.stableToken] += referralsAmount;

        uint256 lpAmount = surplusFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.increaseTotalAmount(pair.pairIndex, 0, lpAmount);

        uint256 keeperAmount = surplusFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        userTradingFee[pair.stableToken][keeper] += keeperAmount;

        uint256 stakingAmount = surplusFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        stakingTradingFee[pair.stableToken] += stakingAmount;

        uint256 distributorAmount = surplusFee - referralsAmount - lpAmount - keeperAmount - stakingAmount;
        distributorTradingFee[pair.stableToken] += distributorAmount;

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
