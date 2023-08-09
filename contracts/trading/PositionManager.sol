pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IIndexPriceFeed.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../interfaces/IPositionManager.sol';
import '../interfaces/ITradingVault.sol';
import '../interfaces/IRoleManager.sol';

import '../libraries/Position.sol';
import '../libraries/Roleable.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import '../pair/interfaces/IPairInfo.sol';
import '../pair/interfaces/IPairVault.sol';
import '../interfaces/IAddressesProvider.sol';
import 'hardhat/console.sol';
import '../interfaces/IOrderManager.sol';

contract PositionManager is IPositionManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IIndexPriceFeed public fastPriceFeed;
    IOraclePriceFeed public vaultPriceFeed;
    IOrderManager public orderManager;

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IOraclePriceFeed _vaultPriceFeed,
        IIndexPriceFeed _fastPriceFeed,
        IOrderManager _orderManager
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        fastPriceFeed = _fastPriceFeed;
        vaultPriceFeed = _vaultPriceFeed;
        orderManager = _orderManager;
    }

    // will remove to increasePosition
    function transferTokenTo(address token, address to, uint256 amount) external {
        IERC20(token).safeTransfer(to, amount);
    }
}
