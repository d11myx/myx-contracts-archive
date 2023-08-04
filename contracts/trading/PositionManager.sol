pragma solidity 0.8.17;


import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IIndexPriceFeed.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "./interfaces/IExecuteRouter.sol";
import "../interfaces/IPositionManager.sol";
import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "../interfaces/IRoleManager.sol";

import "../libraries/Position.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import '../interfaces/IAddressesProvider.sol';
import "hardhat/console.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/IRouter.sol";

contract PositionManager is ReentrancyGuard, IPositionManager {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    IAddressesProvider public immutable ADDRESS_PROVIDER;
    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IIndexPriceFeed public fastPriceFeed;
    IVaultPriceFeed public vaultPriceFeed;
    IOrderManager public orderManager;
    IRouter public router; //TODO warning. temped, will be removed later


    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IVaultPriceFeed _vaultPriceFeed,
        IIndexPriceFeed _fastPriceFeed,
        uint256 _maxTimeDelay,
        IOrderManager _orderManager,
        IRouter _router
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        fastPriceFeed = _fastPriceFeed;
        vaultPriceFeed = _vaultPriceFeed;
        orderManager = _orderManager;
        router = _router;
    }

    modifier onlyKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).contractWhiteList(msg.sender) || IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isKeeper(msg.sender), "onlyKeeper");
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    function setPricesAndLiquidatePositions(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys
    ) external onlyKeeper {
        console.log("setPricesAndLiquidatePositions timestamp", block.timestamp);
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.liquidatePositions(_positionKeys);
    }

    function liquidatePositions(bytes32[] memory _positionKeys) external nonReentrant onlyKeeper {
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            _liquidatePosition(_positionKeys[i]);
        }
    }

    function _liquidatePosition(bytes32 _positionKey) internal {
        console.log("liquidatePosition start");
        Position.Info memory position = tradingVault.getPositionByKey(_positionKey);

        if (position.positionAmount == 0) {
            console.log("position not exists");
            return;
        }

        uint256 price = getValidPrice(position.pairIndex, position.isLong);

        int256 unrealizedPnl;
        if (position.isLong) {
            if (price > position.averagePrice) {
                unrealizedPnl = int256(position.positionAmount.mulPrice(price - position.averagePrice));
            } else {
                unrealizedPnl = - int256(position.positionAmount.mulPrice(position.averagePrice - price));
            }
        } else {
            if (position.averagePrice > price) {
                unrealizedPnl = int256(position.positionAmount.mulPrice(position.averagePrice - price));
            } else {
                unrealizedPnl = - int256(position.positionAmount.mulPrice(price - position.averagePrice));
            }
        }
        console.log("liquidatePosition averagePrice %s unrealizedPnl %s", position.averagePrice, unrealizedPnl.toString());

        int256 exposureAsset = int256(position.collateral) + unrealizedPnl;
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);

        bool needLiquidate;
        if (exposureAsset <= 0) {
            needLiquidate = true;
        } else {
            uint256 riskRate = position.positionAmount.mulPrice(price)
                .mulPercentage(tradingConfig.maintainMarginRate)
                .calculatePercentage(uint256(exposureAsset));
            needLiquidate = riskRate >= PrecisionUtils.oneHundredPercentage();
            console.log("liquidatePosition riskRate %s positionAmount %s exposureAsset %s", riskRate, position.positionAmount, exposureAsset.toString());
        }
        console.log("liquidatePosition needLiquidate", needLiquidate);

        if (!needLiquidate) {
            return;
        }

        //TODO positionManager
        // cancelAllPositionOrders
        tradingRouter.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);

        uint256 orderId = tradingRouter.createDecreaseOrder(
            TradingTypes.DecreasePositionRequest(
                position.account,
                position.pairIndex,
                TradingTypes.TradeType.MARKET,
                0,
                price,
                position.positionAmount,
                position.isLong
            ));

        //todo execute order
        // _executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);

        emit LiquidatePosition(
            _positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.positionAmount,
            position.collateral,
            price,
            orderId
        );
    }

    function getValidPrice(uint256 _pairIndex, bool _isLong) public view returns (uint256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 oraclePrice = vaultPriceFeed.getPrice(pair.indexToken);
        console.log("getValidPrice pairIndex %s isLong %s ", _pairIndex, _isLong);

        uint256 indexPrice = vaultPriceFeed.getIndexPrice(pair.indexToken, 0);
        console.log("getValidPrice oraclePrice %s indexPrice %s", oraclePrice, indexPrice);

        uint256 diffP = oraclePrice > indexPrice ? oraclePrice - indexPrice : indexPrice - oraclePrice;
        diffP = diffP.calculatePercentage(oraclePrice);

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
        console.log("getValidPrice diffP %s maxPriceDeviationP %s", diffP, tradingConfig.maxPriceDeviationP);
        require(diffP <= tradingConfig.maxPriceDeviationP, "exceed max price deviation");
        return oraclePrice;
    }

}
