// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/math/SafeMath.sol";


import {PositionStatus, IPositionManager} from "../interfaces/IPositionManager.sol";
import "../interfaces/IFeeCollector.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IFeeManager.sol";

import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";

import "../libraries/Upgradeable.sol";

abstract contract FeeManager is ReentrancyGuardUpgradeable, IFeeManager, IPositionManager, Upgradeable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using PrecisionUtils for uint256;

    uint256 public override stakingTradingFee;
    //user +keeper
    mapping(address => uint256) public override userTradingFee;

    uint256 public override treasuryFee;

    IPool public pool;
    IFeeCollector public feeCollector;
    address public pledgeAddress;
    address public stakingPool;


    function setStakingPool(address newAddress) external onlyPoolAdmin {
        stakingPool = newAddress;
    }

    function claimStakingTradingFee() external override nonReentrant returns (uint256) {
        require(msg.sender == stakingPool, "!=staking");
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
        uint256 referralRate
    ) internal returns (uint256 lpAmount) {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);

        uint256 vipAmount = tradingFee.mulPercentage(vipRate);
        userTradingFee[account] += vipAmount;

        uint256 surplusFee = tradingFee - vipAmount;

        uint256 referralsAmount = surplusFee.mulPercentage(
            Math.min(referralRate, feeCollector.maxReferralsRatio())
        );

        lpAmount = surplusFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.setLPStableProfit(pair.pairIndex, int256(lpAmount));

        uint256 keeperAmount = surplusFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        userTradingFee[keeper] += keeperAmount;

        uint256 stakingAmount = surplusFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        stakingTradingFee += stakingAmount;

        uint256 distributorAmount = surplusFee -
            referralsAmount -
            lpAmount -
            keeperAmount -
            stakingAmount;
        treasuryFee += distributorAmount.add(referralsAmount);

        emit DistributeTradingFee(
            account,
            pair.pairIndex,
            sizeDelta,
            tradingFee,
            vipAmount,
            referralsAmount,
            lpAmount,
            keeperAmount,
            stakingAmount,
            distributorAmount
        );
    }
}
