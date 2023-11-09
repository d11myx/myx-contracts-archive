// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Upgradeable.sol";
import "../interfaces/IFeeCollector.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IPool.sol";

contract FeeCollector is IFeeCollector, ReentrancyGuardUpgradeable, Upgradeable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using PrecisionUtils for uint256;

    // Trading fee of each tier (pairIndex => tier => fee)
    mapping(uint256 => mapping(uint8 => TradingFeeTier)) public tradingFeeTiers;

    // Maximum of referrals ratio
    uint256 public override maxReferralsRatio;

    uint256 public override stakingTradingFee;
    // user + keeper
    mapping(address => uint256) public override userTradingFee;

    uint256 public override treasuryFee;

    address public pledgeAddress;

    address public addressStakingPool;
    address public addressPositionManager;
    IPool public pool;

    function initialize(
        IAddressesProvider addressesProvider,
        IPool _pool,
        address _pledgeAddress
    ) public initializer {
        ADDRESS_PROVIDER = addressesProvider;
        pool = _pool;
        pledgeAddress = _pledgeAddress;
        maxReferralsRatio = 0.5e8;
    }

    modifier onlyPositionManager() {
        require(msg.sender == addressPositionManager, "onlyPositionManager");
        _;
    }

    modifier onlyStakingPool() {
        require(msg.sender == addressStakingPool, "onlyStakingPool");
        _;
    }

    function getTradingFeeTier(uint256 pairIndex, uint8 tier) external view override returns (TradingFeeTier memory) {
        return tradingFeeTiers[pairIndex][tier];
    }

    function getRegularTradingFeeTier(uint256 pairIndex) external view override returns (TradingFeeTier memory) {
        return tradingFeeTiers[pairIndex][0];
    }

    function updatePositionManagerAddress(address newAddress) external onlyPoolAdmin {
        address oldAddress = addressPositionManager;
        addressPositionManager = newAddress;

        emit UpdatedPositionManagerAddress(msg.sender, oldAddress, newAddress);
    }

    function updateStakingPoolAddress(address newAddress) external onlyPoolAdmin {
        address oldAddress = addressStakingPool;
        addressStakingPool = newAddress;

        emit UpdatedStakingPoolAddress(msg.sender, oldAddress, newAddress);
    }

    function updateTradingFeeTiers(
        uint256 pairIndex,
        uint8[] memory tiers,
        TradingFeeTier[] memory tierFees
    ) external onlyPoolAdmin {
        require(tiers.length == tierFees.length, "inconsistent params length");

        for (uint256 i = 0; i < tiers.length; i++) {
            _updateTradingFeeTier(pairIndex, tiers[i], tierFees[i]);
        }
    }

    function updateTradingFeeTier(
        uint256 pairIndex,
        uint8 tier,
        TradingFeeTier memory tierFee
    ) external onlyPoolAdmin {
        _updateTradingFeeTier(pairIndex, tier, tierFee);
    }

    function updateMaxReferralsRatio(uint256 newRatio) external override onlyPoolAdmin {
        require(newRatio <= PrecisionUtils.percentage(), "exceeds max ratio");

        uint256 oldRatio = maxReferralsRatio;
        maxReferralsRatio = newRatio;

        emit UpdateMaxReferralsRatio(oldRatio, newRatio);
    }

    function claimStakingTradingFee() external override onlyStakingPool returns (uint256) {
        uint256 claimableStakingTradingFee = stakingTradingFee;
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableStakingTradingFee);
            stakingTradingFee = 0;
        }
        emit ClaimedStakingTradingFee(msg.sender, pledgeAddress, claimableStakingTradingFee);
        return claimableStakingTradingFee;
    }

    function claimTreasuryFee() external override onlyPoolAdmin returns (uint256) {
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

    function distributeTradingFee(
        IPool.Pair memory pair,
        address account,
        address keeper,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 vipFeeRate,
        uint256 referralRate
    ) external override onlyPositionManager returns (uint256 lpAmount, uint256 vipDiscountAmount) {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);

        uint256 vipTradingFee = sizeDelta.mulPercentage(vipFeeRate);
        vipDiscountAmount = tradingFee - vipTradingFee;
        userTradingFee[account] += vipDiscountAmount;

        uint256 surplusFee = tradingFee - vipDiscountAmount;

        uint256 referralsAmount = surplusFee.mulPercentage(
            Math.min(referralRate, maxReferralsRatio)
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
            vipDiscountAmount,
            vipFeeRate,
            referralsAmount,
            lpAmount,
            keeperAmount,
            stakingAmount,
            distributorAmount
        );
    }

    function _claimUserTradingFee() internal returns (uint256) {
        uint256 claimableUserTradingFee = userTradingFee[msg.sender];
        if (claimableUserTradingFee > 0) {
            userTradingFee[msg.sender] = 0;
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableUserTradingFee);
        }
        emit ClaimedUserTradingFee(msg.sender, pledgeAddress, claimableUserTradingFee);
        return claimableUserTradingFee;
    }

    function _updateTradingFeeTier(
        uint256 pairIndex,
        uint8 tier,
        TradingFeeTier memory tierFee
    ) internal {
        TradingFeeTier memory regularTierFee = tradingFeeTiers[pairIndex][0];
        require(tier == 0
            || (tierFee.takerFee <= regularTierFee.takerFee && tierFee.makerFee <= regularTierFee.makerFee),
            "exceeds max ratio"
        );

        TradingFeeTier memory oldTierFee = tradingFeeTiers[pairIndex][tier];
        tradingFeeTiers[pairIndex][tier] = tierFee;

        emit updatedTradingFeeTier(
            msg.sender,
            tier,
            oldTierFee.takerFee,
            oldTierFee.makerFee,
            tradingFeeTiers[pairIndex][tier].takerFee,
            tradingFeeTiers[pairIndex][tier].makerFee
        );
    }
}
