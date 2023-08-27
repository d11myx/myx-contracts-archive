pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import '../interfaces/IPool.sol';
import '../interfaces/IFeeManager.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';

abstract contract FeeManager is ReentrancyGuard, IFeeManager, Roleable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;

    mapping(address => uint256) public override stakingTradingFee;
    mapping(address => uint256) public override distributorTradingFee;
    mapping(address => mapping(address => uint256)) public override userTradingFee;
    mapping(address => uint256) public referenceTradingFee;
    IPool public immutable pool;

    constructor(IAddressesProvider addressProvider, IPool _pool) Roleable(addressProvider) {
        pool = IPool(_pool);
    }

    function claimStakingTradingFee(address claimToken) external nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableStakingTradingFee = stakingTradingFee[claimToken];
        if (claimableStakingTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableStakingTradingFee);
            stakingTradingFee[claimToken] = 0;
        }
        return claimableStakingTradingFee;
    }

    function claimDistributorTradingFee(address claimToken) external nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableDistributorTradingFee = distributorTradingFee[claimToken];
        if (claimableDistributorTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableDistributorTradingFee);
            distributorTradingFee[claimToken] = 0;
        }
        return claimableDistributorTradingFee;
    }

    function claimKeeperTradingFee(address claimToken) external nonReentrant returns (uint256) {
        uint256 claimableKeeperTradingFee = userTradingFee[claimToken][msg.sender];
        if (claimableKeeperTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableKeeperTradingFee);
            IERC20(claimToken).safeTransfer(msg.sender, claimableKeeperTradingFee);
            userTradingFee[claimToken][msg.sender] = 0;
        }
        return claimableKeeperTradingFee;
    }

    function _updateFee(
        IPool.Pair memory pair,
        address account,
        address keeper,
        uint256 tradingFee,
        uint256 vipRate,
        uint256 referenceRate
    ) internal {
        IPool.TradingFeeConfig memory tradingFeeConfig = pool.getTradingFeeConfig(pair.pairIndex);
        uint256 lpAmount = tradingFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.increaseTotalAmount(pair.pairIndex, 0, lpAmount);
        uint256 keeperAmount = tradingFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        uint256 vipAmount = tradingFee.mulPercentage(vipRate);
        uint256 refenceAmount = tradingFee.mulPercentage(referenceRate);
        uint256 stakingAmount = tradingFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        uint256 distributorAmount = tradingFee - keeperAmount - stakingAmount;
        userTradingFee[pair.stableToken][keeper] += keeperAmount;
        stakingTradingFee[pair.stableToken] += stakingAmount;
        distributorTradingFee[pair.stableToken] += distributorAmount;
        userTradingFee[pair.stableToken][account] += vipAmount;
        referenceTradingFee[pair.stableToken] += refenceAmount;
        emit DistributeTradingFee(account, pair.pairIndex, lpAmount, keeperAmount, stakingAmount, distributorAmount);
    }
}
