pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import '../interfaces/IPool.sol';
import '../interfaces/IFeeManager.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import "./FeeCollector.sol";

abstract contract FeeManager is ReentrancyGuard, IFeeManager, Roleable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;

    mapping(address => uint256) public override stakingTradingFee;
    mapping(address => uint256) public override distributorTradingFee;
    mapping(address => mapping(address => uint256)) public override userTradingFee;
    mapping(address => uint256) public override referenceTradingFee;

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
        return claimableStakingTradingFee;
    }

    function claimDistributorTradingFee(address claimToken) external override nonReentrant onlyPoolAdmin returns (uint256) {
        uint256 claimableDistributorTradingFee = distributorTradingFee[claimToken];
        if (claimableDistributorTradingFee > 0) {
            pool.transferTokenTo(claimToken, msg.sender, claimableDistributorTradingFee);
            distributorTradingFee[claimToken] = 0;
        }
        return claimableDistributorTradingFee;
    }

    function claimKeeperTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function claimUserTradingFee(address claimToken) external override nonReentrant returns (uint256) {
        return _claimUserTradingFee(claimToken);
    }

    function _claimUserTradingFee(address claimToken) internal returns (uint256) {
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

        uint256 vipAmount = tradingFee.mulPercentage(vipRate);
        userTradingFee[pair.stableToken][account] += vipAmount;

        uint256 surplusFee = tradingFee - vipAmount;

        uint256 referenceAmount = surplusFee.mulPercentage(Math.min(referenceRate, feeCollector.maxReferenceRatio()));
        referenceTradingFee[pair.stableToken] += referenceAmount;

        uint256 lpAmount = surplusFee.mulPercentage(tradingFeeConfig.lpFeeDistributeP);
        pool.increaseTotalAmount(pair.pairIndex, 0, lpAmount);

        uint256 keeperAmount = surplusFee.mulPercentage(tradingFeeConfig.keeperFeeDistributeP);
        userTradingFee[pair.stableToken][keeper] += keeperAmount;

        uint256 stakingAmount = surplusFee.mulPercentage(tradingFeeConfig.stakingFeeDistributeP);
        stakingTradingFee[pair.stableToken] += stakingAmount;

        uint256 distributorAmount = surplusFee - lpAmount - keeperAmount - stakingAmount;
        distributorTradingFee[pair.stableToken] += distributorAmount;

        emit DistributeTradingFee(
            account,
            pair.pairIndex,
            tradingFee,
            referenceAmount,
            lpAmount,
            keeperAmount,
            stakingAmount,
            distributorAmount
        );
    }
}
