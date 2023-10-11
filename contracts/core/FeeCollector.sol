// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

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

    // Discount ratio of every level (level => LevelDiscount)
    mapping(uint8 => LevelDiscount) public levelDiscounts;

    // Maximum of referrals ratio
    uint256 public override maxReferralsRatio;

    uint256 public override stakingTradingFee;
    // user + keeper
    mapping(address => uint256) public override userTradingFee;

    uint256 public override treasuryFee;

    address public pledgeAddress;

    address public addressStakingPool;
    IPool public pool;

    function initialize(IAddressesProvider addressesProvider, IPool _pool, address _pledgeAddress) public initializer {
        ADDRESS_PROVIDER = addressesProvider;
        pool = _pool;
        pledgeAddress = _pledgeAddress;
        maxReferralsRatio = 1e7;
//        levelDiscounts[1] = LevelDiscount(1e6, 1e6);
//        levelDiscounts[2] = LevelDiscount(2e6, 2e6);
//        levelDiscounts[3] = LevelDiscount(3e6, 3e6);
//        levelDiscounts[4] = LevelDiscount(4e6, 4e6);
//        levelDiscounts[5] = LevelDiscount(5e6, 5e6);
    }

    function getLevelDiscounts(uint8 level) external view override returns (LevelDiscount memory) {
        return levelDiscounts[level];
    }

    function updateLevelDiscountRatio(
        uint8 level,
        LevelDiscount memory discount
    ) external override {
        require(
            discount.makerDiscountRatio <= PrecisionUtils.percentage() &&
                discount.takerDiscountRatio <= PrecisionUtils.percentage(),
            "exceeds max ratio"
        );

        LevelDiscount memory oldDiscount = levelDiscounts[level];
        levelDiscounts[level] = discount;

        emit UpdateLevelDiscountRatio(
            level,
            oldDiscount.makerDiscountRatio,
            oldDiscount.takerDiscountRatio,
            levelDiscounts[level].makerDiscountRatio,
            levelDiscounts[level].takerDiscountRatio
        );
    }

    function updateMaxReferralsRatio(uint256 newRatio) external override {
        require(newRatio <= PrecisionUtils.percentage(), "exceeds max ratio");

        uint256 oldRatio = maxReferralsRatio;
        maxReferralsRatio = newRatio;

        emit UpdateMaxReferralsRatio(oldRatio, newRatio);
    }

    function updateStakingPoolAddress(address newAddress) external onlyPoolAdmin {
        address oldAddress = addressStakingPool;
        addressStakingPool = newAddress;

        emit UpdatedStakingPoolAddress(msg.sender, oldAddress, newAddress);
    }

    function claimStakingTradingFee() external override nonReentrant returns (uint256) {
        require(msg.sender == addressStakingPool, "!=staking");

        uint256 claimableStakingTradingFee = stakingTradingFee;
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(pledgeAddress, msg.sender, claimableStakingTradingFee);
            stakingTradingFee = 0;
        }
        emit ClaimedStakingTradingFee(msg.sender, pledgeAddress, claimableStakingTradingFee);
        return claimableStakingTradingFee;
    }

    function claimTreasuryFee() external override nonReentrant onlyPoolAdmin returns (uint256) {
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

    function distributeTradingFee(
        IPool.Pair memory pair,
        address account,
        address keeper,
        uint256 sizeDelta,
        uint256 tradingFee,
        uint256 vipRate,
        uint256 referralRate
    ) external override returns (uint256 lpAmount) {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);

        uint256 vipAmount = tradingFee.mulPercentage(vipRate);
        userTradingFee[account] += vipAmount;

        uint256 surplusFee = tradingFee - vipAmount;

        uint256 referralsAmount = surplusFee.mulPercentage(Math.min(referralRate, maxReferralsRatio));

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
            vipRate,
            referralsAmount,
            lpAmount,
            keeperAmount,
            stakingAmount,
            distributorAmount
        );
    }
}
