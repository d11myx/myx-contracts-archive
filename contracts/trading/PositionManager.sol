pragma solidity 0.8.17;


import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IIndexPriceFeed.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/ITradingVault.sol";
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

    uint256 public maxTimeDelay;

    IAddressesProvider public immutable ADDRESS_PROVIDER;
    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IIndexPriceFeed public fastPriceFeed;
    IVaultPriceFeed public vaultPriceFeed;
    IOrderManager public orderManager;
    IRouter public router; //TODO warning. temped, will be removed later


    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IVaultPriceFeed _vaultPriceFeed,
        IIndexPriceFeed _fastPriceFeed,
        uint256 _maxTimeDelay,
        IOrderManager _orderManager,
        IRouter _router
    ) {
        maxTimeDelay = _maxTimeDelay;
        ADDRESS_PROVIDER = addressProvider;
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        fastPriceFeed = _fastPriceFeed;
        vaultPriceFeed = _vaultPriceFeed;
        orderManager = _orderManager;
        router = _router;
    }

    modifier onlyWhitelistOrKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).contractWhiteList(msg.sender)
        || IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isKeeper(msg.sender),
            "onlyKeeper");
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    function updateMaxTimeDelay(uint256 _maxTimeDelay) external override onlyPoolAdmin {
        uint256 oldDelay = _maxTimeDelay;
        maxTimeDelay = _maxTimeDelay;
        uint256 newDelay = maxTimeDelay;

        emit UpdateMaxTimeDelay(oldDelay, newDelay);
    }

    function executeIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public nonReentrant onlyWhitelistOrKeeper {
        console.log("executeIncreaseOrder account %s orderId %s tradeType %s", msg.sender, _orderId, uint8(_tradeType));

        TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(_orderId, _tradeType);


        if (order.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        require(pair.enable, "trade pair not supported");

        // check account enable
        require(!tradingVault.isFrozen(order.account), "account is frozen");

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        require(order.sizeAmount == 0 || (order.sizeAmount >= tradingConfig.minTradeAmount && order.sizeAmount <= tradingConfig.maxTradeAmount), "invalid trade size");

        // check price
        uint256 price = getValidPrice(pairIndex, order.isLong);
        if (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT) {
            require(order.isLong ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <= order.openPrice
                : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >= order.openPrice, "not reach trigger price");
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, "not reach trigger price");
        }

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (order.isLong) {
                price = order.openPrice.min(price);
            } else {
                price = order.openPrice.max(price);
            }
        }

        // get position
        Position.Info memory position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);
        console.log("executeIncreaseOrder sizeAmount", order.sizeAmount, "sizeDelta", sizeDelta);

        // check position and leverage
        (uint256 afterPosition,) = position.validLeverage(price, order.collateral, order.sizeAmount, true, tradingConfig.minLeverage, tradingConfig.maxLeverage, tradingConfig.maxPositionAmount);
        require(afterPosition > 0, "zero position amount");

        // check tp sl
        require(order.tp == 0 || !orderManager.positionHasTpSl(position.key, TradingTypes.TradeType.TP), "tp already exists");
        require(order.sl == 0 || !orderManager.positionHasTpSl(position.key, TradingTypes.TradeType.SL), "sl already exists");

        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("executeIncreaseOrder preNetExposureAmountChecker", preNetExposureAmountChecker.abs());
        if (preNetExposureAmountChecker >= 0) {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("executeIncreaseOrder availableIndex", availableIndex);
                require(order.sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("executeIncreaseOrder availableStable", availableStable);
                require(order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price), "lp stable token not enough");
            }
        } else {
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("executeIncreaseOrder availableIndex", availableIndex);
                require(order.sizeAmount <= uint256(- preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("executeIncreaseOrder availableStable", availableStable);
                require(order.sizeAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        // transfer collateral
        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(address(tradingVault), order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee) = tradingVault.increasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong, price);

        orderManager.removeOrderFromPosition(
            IOrderManager.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));

        if (order.tp > 0) {
            orderManager.createOrder(TradingTypes.CreateOrderRequest({
                account: order.account,
                pairIndex: order.pairIndex,
                tradeType: TradingTypes.TradeType.TP,
                collateral: 0,
                openPrice: order.tpPrice,
                isLong: order.isLong,
                sizeAmount: - int256(order.tp),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            }));
        }
        if (order.sl > 0) {
            orderManager.createOrder(TradingTypes.CreateOrderRequest({
                account: order.account,
                pairIndex: order.pairIndex,
                tradeType: TradingTypes.TradeType.SL,
                collateral: 0,
                openPrice: order.slPrice,
                isLong: order.isLong,
                sizeAmount: - int256(order.sl),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            }));
        }

        // delete order
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            orderManager.removeIncreaseMarketOrders(_orderId);
        } else if (_tradeType == TradingTypes.TradeType.LIMIT) {
            orderManager.removeIncreaseLimitOrders(_orderId);
        }

        emit ExecuteIncreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            _tradeType,
            order.collateral,
            order.isLong,
            order.sizeAmount,
            price,
            tradingFee,
            fundingFee
        );
    }

    function executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public nonReentrant onlyWhitelistOrKeeper {
        console.log("executeDecreaseOrder account %s orderId %s tradeType %s", msg.sender, _orderId, uint8(_tradeType));

        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            console.log("executeDecreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        // get pair
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);

        // get position
        Position.Info memory position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            console.log("position already closed", _orderId);
            return;
        }

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);

        order.sizeAmount = order.sizeAmount.min(position.positionAmount);
        require(order.sizeAmount == 0 || (order.sizeAmount >= tradingConfig.minTradeAmount && order.sizeAmount <= tradingConfig.maxTradeAmount), "invalid trade size");

        // check price
        uint256 price = getValidPrice(pairIndex, order.isLong);
        if (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT) {
            require(order.abovePrice ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <= order.triggerPrice
                : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >= order.triggerPrice, "not reach trigger price");
        } else {
            require(order.abovePrice ? price <= order.triggerPrice : price >= order.triggerPrice, "not reach trigger price");
        }

        // compare openPrice and oraclePrice
        if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            if (!order.isLong) {
                price = order.triggerPrice.min(price);
            } else {
                price = order.triggerPrice.max(price);
            }
        }

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);
        console.log("executeDecreaseOrder sizeAmount", order.sizeAmount, "sizeDelta", sizeDelta);

        // check position and leverage
        position.validLeverage(price, order.collateral, order.sizeAmount, false, tradingConfig.minLeverage, tradingConfig.maxLeverage, tradingConfig.maxPositionAmount);

        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("executeDecreaseOrder preNetExposureAmountChecker", preNetExposureAmountChecker.toString());
        bool needADL;
        if (preNetExposureAmountChecker >= 0) {
            if (!order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("executeDecreaseOrder availableIndex", availableIndex);
                needADL = order.sizeAmount > availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("executeDecreaseOrder availableStable", availableStable);
                needADL = order.sizeAmount > uint256(preNetExposureAmountChecker) + availableStable.divPrice(price);
            }
        } else {
            if (!order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("executeDecreaseOrder availableIndex", availableIndex);
                needADL = order.sizeAmount > uint256(- preNetExposureAmountChecker) + availableIndex;
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("executeDecreaseOrder availableStable", availableStable);
                needADL = order.sizeAmount > availableStable.divPrice(price);
            }
        }

        if (needADL) {
            console.log("executeDecreaseOrder needADL");
            orderManager.setOrderNeedADL(_orderId, order.tradeType, needADL);

            emit ExecuteDecreaseOrder(
                order.account,
                _orderId,
                pairIndex,
                order.tradeType,
                order.isLong,
                order.sizeAmount,
                price,
                0,
                needADL,
                0,
                0
            );
            return;
        }

        // transfer collateral
        if (order.collateral > 0) {
            IPairInfo.Pair memory pair = pairInfo.getPair(position.pairIndex);
            IERC20(pair.stableToken).safeTransfer(address(tradingVault), order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee, int256 pnl) = tradingVault.decreasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong, price);

        // delete order
        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            orderManager.removeDecreaseMarketOrders(_orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            orderManager.removeDecreaseLimitOrders(_orderId);
        } else {
            orderManager.setPositionHasTpSl(position.key, order.tradeType, false);
            orderManager.removeDecreaseLimitOrders(_orderId);
        }

        // remove decrease order
        orderManager.removeOrderFromPosition(
            IOrderManager.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

        position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);

        if (position.positionAmount == 0) {
            // cancel all decrease order
            bytes32 key = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);
            IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

            for (uint256 i = 0; i < orders.length; i++) {
                IOrderManager.PositionOrder memory positionOrder = orders[i];
                if (!positionOrder.isIncrease) {
                    orderManager.cancelOrder(positionOrder.orderId, positionOrder.tradeType, false);
                }
            }
        }

        emit ExecuteDecreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            order.tradeType,
            order.isLong,
            order.sizeAmount,
            price,
            pnl,
            needADL,
            tradingFee,
            fundingFee
        );
    }

    function setPricesAndLiquidatePositions(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys
    ) external onlyWhitelistOrKeeper {
        console.log("setPricesAndLiquidatePositions timestamp", block.timestamp);
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.liquidatePositions(_positionKeys);
    }

    function liquidatePositions(bytes32[] memory _positionKeys) external nonReentrant onlyWhitelistOrKeeper {
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            _liquidatePosition(_positionKeys[i]);
        }
    }

    function executeADLAndDecreaseOrder(
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType
    ) external nonReentrant onlyWhitelistOrKeeper {
        console.log("executeADLAndDecreaseOrder");

        require(_positionKeys.length == _sizeAmounts.length, "length not match");

        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(_orderId, _tradeType);
        require(order.needADL, "no need ADL");


        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(order.pairIndex);

        Position.Info[] memory adlPositions = new Position.Info[](_positionKeys.length);
        uint256 sumAmount;
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            Position.Info memory position = tradingVault.getPositionByKey(_positionKeys[i]);
            require(_sizeAmounts[i] <= position.positionAmount, "ADL size exceeds position");
            require(_sizeAmounts[i] <= tradingConfig.maxTradeAmount, "exceeds max trade amount");
            sumAmount += _sizeAmounts[i];
            adlPositions[i] = position;
        }

        require(sumAmount == order.sizeAmount, "ADL position amount not match decrease order");
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        uint256 price = getValidPrice(order.pairIndex, !order.isLong);

        for (uint256 i = 0; i < adlPositions.length; i++) {
            Position.Info memory adlPosition = adlPositions[i];
            uint256 orderId = orderManager.createOrder(TradingTypes.CreateOrderRequest({
                account: adlPosition.account,
                pairIndex: adlPosition.pairIndex,
                tradeType: TradingTypes.TradeType.MARKET,
                collateral: 0,
                openPrice: price,
                isLong: adlPosition.isLong,
                sizeAmount: - int256(adlPosition.positionAmount),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0
            }));
            executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);
            console.log();
        }
        executeDecreaseOrder(_orderId, order.tradeType);
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
//        tradingRouter.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);

        uint256 orderId = orderManager.createOrder(TradingTypes.CreateOrderRequest({
            account: position.account,
            pairIndex: position.pairIndex,
            tradeType: TradingTypes.TradeType.MARKET,
            collateral: 0,
            openPrice: price,
            isLong: position.isLong,
            sizeAmount: - int256(position.positionAmount),
            tpPrice: 0,
            tp: 0,
            slPrice: 0,
            sl: 0
        }));

        this.executeDecreaseOrder(orderId, TradingTypes.TradeType.MARKET);

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
