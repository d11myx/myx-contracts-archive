pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import {PositionStatus, IPositionManager} from '../interfaces/IPositionManager.sol';
import '../interfaces/IPool.sol';
import '../interfaces/IFeeManager.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import './FeeCollector.sol';

abstract contract FeeManager is ReentrancyGuard, IFeeManager, IPositionManager, Roleable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using PrecisionUtils for uint256;

    uint256 public override stakingTradingFee;
    //user +keeper
    mapping(address => uint256) public override userTradingFee;

    uint256 public override treasuryFee;

    IPool public immutable pool;
    IFeeCollector public immutable feeCollector;
    address public immutable pledgeAddress;
    address public stakingPool;

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

    function setStakingPool(address newAddress) external onlyPoolAdmin {
        stakingPool = newAddress;
    }

    function claimStakingTradingFee() external override nonReentrant returns (uint256) {
        require(msg.sender == stakingPool, '!=staking');
        uint256 claimableStakingTradingFee = stakingTradingFee;
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableStakingTradingFee);
            stakingTradingFee = 0;
        }
        emit ClaimedStakingTradingFee(msg.sender, pledgeAddress, claimableStakingTradingFee);
        return claimableStakingTradingFee;
    }

    function claimTreauryFee() external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableTreasuryFee = treasuryFee;
        if (claimableTreasuryFee > 0) {
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableTreasuryFee);
            treasuryFee = 0;
        }
        emit ClaimedDistributorTradingFee(msg.sender, pledgeAddress, claimableTreasuryFee);
        return claimableTreasuryFee;
    }

    function claimKeeperTradingFee() external override nonReentrant returns (uint256) {
        return _claimUserTradingFee();
    }

    function claimUserTradingFee() external override nonReentrant returns (uint256) {
        return _claimUserTradingFee();
    }

    function _claimUserTradingFee() internal returns (uint256) {
        uint256 claimableUserTradingFee = userTradingFee[msg.sender];
        if (claimableUserTradingFee > 0) {
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableUserTradingFee);
            IERC20(pledgeAddress).safeTransfer(msg.sender, claimableUserTradingFee);
            userTradingFee[msg.sender] = 0;
        }
        emit ClaimedUserTradingFee(msg.sender, pledgeAddress, claimableUserTradingFee);
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

        uint256 lpAmount = surplusFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.increaseLPProfit(pair.pairIndex, lpAmount);

        uint256 keeperAmount = surplusFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        userTradingFee[keeper] += keeperAmount;

        uint256 stakingAmount = surplusFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        stakingTradingFee += stakingAmount;

        uint256 distributorAmount = surplusFee - referralsAmount - lpAmount - keeperAmount - stakingAmount;
        treasuryFee += distributorAmount.add(referralsAmount);

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
