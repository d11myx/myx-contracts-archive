// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../libraries/access/Handleable.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../interfaces/IIndexPriceFeed.sol";

import "./interfaces/IExecuteRouter.sol";
import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "./interfaces/ITradingUtils.sol";
import "hardhat/console.sol";

contract ExecuteRouter is IExecuteRouter, ReentrancyGuardUpgradeable, Handleable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        ITradingRouter.TradeType tradeType,
        int256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee
    );
    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        ITradingRouter.TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        int256 pnl,
        bool needADL,            // 需要执行ADL
        uint256 tradingFee,
        int256 fundingFee
    );
    event LiquidatePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 collateral,
        uint256 price,
        uint256 orderId
    );

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IIndexPriceFeed public fastPriceFeed;
    ITradingUtils public tradingUtils;

    uint256 public maxTimeDelay;

    mapping(address => bool) public isPositionKeeper;

    modifier onlyPositionKeeper() {
        require(msg.sender == address(this) || isPositionKeeper[msg.sender], "only position keeper");
        _;
    }

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IIndexPriceFeed _fastPriceFeed,
        ITradingUtils _tradingUtils,
        uint256 _maxTimeDelay
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        fastPriceFeed = _fastPriceFeed;
        tradingUtils = _tradingUtils;
        maxTimeDelay = _maxTimeDelay;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IIndexPriceFeed _fastPriceFeed,
        ITradingUtils _tradingUtils
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        fastPriceFeed = _fastPriceFeed;
        tradingUtils = _tradingUtils;
    }

    function setPositionKeeper(address _account, bool _enable) external onlyGov {
        isPositionKeeper[_account] = _enable;
    }

    function setMaxTimeDelay(uint256 _maxTimeDelay) external onlyGov {
        maxTimeDelay = _maxTimeDelay;
    }

    function setPricesAndExecuteMarketOrders(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        uint256 _increaseEndIndex,
        uint256 _decreaseEndIndex
    ) external onlyPositionKeeper {
        console.log("setPricesAndExecuteMarketOrders");
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.executeIncreaseMarketOrders(_increaseEndIndex);
        this.executeDecreaseMarketOrders(_decreaseEndIndex);
    }

    function setPricesAndExecuteLimitOrders(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        uint256[] memory _increaseOrderIds,
        uint256[] memory _decreaseOrderIds
    ) external onlyPositionKeeper {
        console.log("setPricesAndExecuteLimitOrders");
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.executeIncreaseLimitOrders(_increaseOrderIds);
        this.executeDecreaseLimitOrders(_decreaseOrderIds);
    }

    function executeIncreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        console.log("executeIncreaseMarketOrders endIndex", _endIndex, "timestamp", block.timestamp);
        uint256 index = tradingRouter.increaseMarketOrderStartIndex();
        uint256 length = tradingRouter.increaseMarketOrdersIndex();

        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeIncreaseOrder(index, ITradingRouter.TradeType.MARKET) {
                console.log();
            } catch Error(string memory reason) {
                console.log("executeIncreaseMarketOrder error ", reason);
                tradingRouter.cancelIncreaseOrder(index, ITradingRouter.TradeType.MARKET);
            }
            index++;
        }
        tradingRouter.setIncreaseMarketOrderStartIndex(index);
    }

    function executeIncreaseLimitOrders(uint256[] memory _orderIds) external onlyPositionKeeper {
        console.log("executeIncreaseLimitOrders timestamp", block.timestamp);

        for (uint256 i = 0; i < _orderIds.length; i++) {
            uint256 index = _orderIds[i];
            try this.executeIncreaseOrder(index, ITradingRouter.TradeType.LIMIT) {
                console.log();
            } catch Error(string memory reason) {
                console.log("executeIncreaseLimitOrders error ", reason);
            }
        }
    }

    function executeIncreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        console.log("executeIncreaseOrder account %s orderId %s tradeType %s", msg.sender, _orderId, uint8(_tradeType));

        ITradingRouter.IncreasePositionOrder memory order = tradingRouter.getIncreaseOrder(_orderId, _tradeType);


        if (order.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == ITradingRouter.TradeType.MARKET) {
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
        uint256 price = tradingUtils.getValidPrice(pairIndex, order.isLong);
        if (order.tradeType == ITradingRouter.TradeType.MARKET || order.tradeType == ITradingRouter.TradeType.LIMIT) {
            console.log("===============================");
            console.log("-----", price);
            console.log("-------", price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP));

            require(order.isLong ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <= order.openPrice
                : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >= order.openPrice, "not reach trigger price");
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, "not reach trigger price");
        }

        // compare openPrice and oraclePrice
        if (order.tradeType == ITradingRouter.TradeType.LIMIT) {
            if (order.isLong) {
                price = order.openPrice.min(price);
            } else {
                price = order.openPrice.max(price);
            }
        }

        // get position
        ITradingVault.Position memory position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);
        console.log("executeIncreaseOrder sizeAmount", order.sizeAmount, "sizeDelta", sizeDelta);

        // check position and leverage
        (uint256 afterPosition, ) = tradingUtils.validLeverage(order.account, order.pairIndex, order.isLong, order.collateral, order.sizeAmount, true);
        require(afterPosition > 0, "zero position amount");

        // check tp sl
        require(order.tp == 0 || !tradingRouter.positionHasTpSl(position.key, ITradingRouter.TradeType.TP), "tp already exists");
        require(order.sl == 0 || !tradingRouter.positionHasTpSl(position.key, ITradingRouter.TradeType.SL), "sl already exists");

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
            tradingRouter.transferToVault(pair.stableToken, order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee) = tradingVault.increasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong, price);

        tradingRouter.removeOrderFromPosition(
            ITradingRouter.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));
        tradingRouter.createTpSl(
            ITradingRouter.CreateTpSlRequest(
                order.account,
                order.pairIndex,
                order.isLong,
                order.tpPrice,
                order.tp,
                order.slPrice,
                order.sl
            )
        );

        // delete order
        if (_tradeType == ITradingRouter.TradeType.MARKET) {
            tradingRouter.removeFromIncreaseMarketOrders(_orderId);
        } else if (_tradeType == ITradingRouter.TradeType.LIMIT) {
            tradingRouter.removeFromIncreaseLimitOrders(_orderId);
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

    function executeDecreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        console.log("executeDecreaseMarketOrders endIndex", _endIndex, "timestamp", block.timestamp);
        uint256 index = tradingRouter.decreaseMarketOrderStartIndex();
        uint256 length = tradingRouter.decreaseMarketOrdersIndex();
        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeDecreaseOrder(index, ITradingRouter.TradeType.MARKET) {
                console.log("executeDecreaseMarketOrders success index", index, "_endIndex", _endIndex);
            } catch Error(string memory reason) {
                console.log("executeDecreaseMarketOrders error ", reason);
                tradingRouter.cancelDecreaseOrder(index, ITradingRouter.TradeType.MARKET);
            }
            index++;
        }
        tradingRouter.setDecreaseMarketOrderStartIndex(index);
    }

    function executeDecreaseLimitOrders(uint256[] memory _orderIds) external onlyPositionKeeper {
        console.log("executeDecreaseLimitOrders timestamp", block.timestamp);

        for (uint256 i = 0; i < _orderIds.length; i++) {
            uint256 index = _orderIds[i];
            try this.executeDecreaseOrder(index, ITradingRouter.TradeType.LIMIT) {
                console.log("executeDecreaseLimitOrders success index", index);
            } catch Error(string memory reason) {
                console.log("executeDecreaseLimitOrders error ", reason);
            }
        }
    }


    function executeDecreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        _executeDecreaseOrder(_orderId, _tradeType);
    }

    function _executeDecreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) internal {
        console.log("executeDecreaseOrder account %s orderId %s tradeType %s", msg.sender, _orderId, uint8(_tradeType));

        ITradingRouter.DecreasePositionOrder memory order = tradingRouter.getDecreaseOrder(_orderId, _tradeType);


        if (order.account == address(0)) {
            console.log("executeDecreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (order.tradeType == ITradingRouter.TradeType.MARKET) {
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        // get pair
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);

        // get position
        ITradingVault.Position memory position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            console.log("position already closed", _orderId);
            return;
        }

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);

        order.sizeAmount = order.sizeAmount.min(position.positionAmount);
        require(order.sizeAmount == 0 || (order.sizeAmount >= tradingConfig.minTradeAmount && order.sizeAmount <= tradingConfig.maxTradeAmount), "invalid trade size");

        // check price
        uint256 price = tradingUtils.getValidPrice(pairIndex, order.isLong);
        if (order.tradeType == ITradingRouter.TradeType.MARKET || order.tradeType == ITradingRouter.TradeType.LIMIT) {
            require(order.abovePrice ? price.mulPercentage(PrecisionUtils.oneHundredPercentage() - tradingConfig.priceSlipP) <= order.triggerPrice
                : price.mulPercentage(PrecisionUtils.oneHundredPercentage() + tradingConfig.priceSlipP) >= order.triggerPrice, "not reach trigger price");
        } else {
            require(order.abovePrice ? price <= order.triggerPrice : price >= order.triggerPrice, "not reach trigger price");
        }

        // compare openPrice and oraclePrice
        if (order.tradeType == ITradingRouter.TradeType.LIMIT) {
            if (!order.isLong) {
                price = order.triggerPrice.min(price);
            } else {
                price = order.triggerPrice.max(price);
            }
        }

        uint256 sizeDelta = order.sizeAmount.mulPrice(price);
        console.log("executeDecreaseOrder sizeAmount", order.sizeAmount, "sizeDelta", sizeDelta);

        // check position and leverage
        tradingUtils.validLeverage(position.account, position.pairIndex, position.isLong, order.collateral, order.sizeAmount, false);

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
            tradingRouter.setOrderNeedADL(_orderId, order.tradeType, needADL);

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
            tradingRouter.transferToVault(pair.stableToken, order.collateral.abs());
        }
        (uint256 tradingFee, int256 fundingFee, int256 pnl)
            = tradingVault.decreasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong, price);

        // delete order
        if (order.tradeType == ITradingRouter.TradeType.MARKET) {
            tradingRouter.removeFromDecreaseMarketOrders(_orderId);
        } else if (order.tradeType == ITradingRouter.TradeType.LIMIT) {
            tradingRouter.removeFromDecreaseLimitOrders(_orderId);
        } else {
            tradingRouter.setPositionHasTpSl(position.key, order.tradeType, false);
            tradingRouter.removeFromDecreaseLimitOrders(_orderId);
        }

        // remove decrease order
        tradingRouter.removeOrderFromPosition(
            ITradingRouter.PositionOrder(
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
            tradingRouter.cancelOrders(order.account, order.pairIndex, order.isLong, false);
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
    ) external onlyPositionKeeper {
        console.log("setPricesAndLiquidatePositions timestamp", block.timestamp);
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.liquidatePositions(_positionKeys);
    }

    function liquidatePositions(bytes32[] memory _positionKeys) external nonReentrant onlyPositionKeeper {
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            _liquidatePosition(_positionKeys[i]);
        }
    }

    function _liquidatePosition(bytes32 _positionKey) internal {
        console.log("liquidatePosition start");
        ITradingVault.Position memory position = tradingVault.getPositionByKey(_positionKey);

        if (position.positionAmount == 0) {
            console.log("position not exists");
            return;
        }

        uint256 price = tradingUtils.getValidPrice(position.pairIndex, position.isLong);

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

        tradingRouter.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);


        uint256 orderId = tradingRouter.createDecreaseOrder(
            ITradingRouter.DecreasePositionRequest(
                position.account,
                position.pairIndex,
                ITradingRouter.TradeType.MARKET,
                0,
                price,
                position.positionAmount,
                position.isLong
            ));

        _executeDecreaseOrder(orderId, ITradingRouter.TradeType.MARKET);

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

    function setPricesAndExecuteADL(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        ITradingRouter.TradeType _tradeType
    ) external onlyPositionKeeper {
        console.log("setPricesAndExecuteADL timestamp", block.timestamp);
        fastPriceFeed.setPrices(_tokens, _prices, _timestamp);
        this.executeADLAndDecreaseOrder(_positionKeys, _sizeAmounts, _orderId, _tradeType);
    }

    function executeADLAndDecreaseOrder(
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        ITradingRouter.TradeType _tradeType
    ) external nonReentrant onlyPositionKeeper {
        console.log("executeADLAndDecreaseOrder");

        require(_positionKeys.length == _sizeAmounts.length, "length not match");

        ITradingRouter.DecreasePositionOrder memory order = tradingRouter.getDecreaseOrder(_orderId, _tradeType);
        require(order.needADL, "no need ADL");


        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(order.pairIndex);

        ITradingVault.Position[] memory adlPositions = new ITradingVault.Position[](_positionKeys.length);
        uint256 sumAmount;
        for (uint256 i = 0; i < _positionKeys.length; i++) {
            ITradingVault.Position memory position = tradingVault.getPositionByKey(_positionKeys[i]);
            require(_sizeAmounts[i] <= position.positionAmount, "ADL size exceeds position");
            require(_sizeAmounts[i] <= tradingConfig.maxTradeAmount, "exceeds max trade amount");
            sumAmount += _sizeAmounts[i];
            adlPositions[i] = position;
        }

        require(sumAmount == order.sizeAmount, "ADL position amount not match decrease order");
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        uint256 price = tradingUtils.getValidPrice(order.pairIndex, !order.isLong);

        for (uint256 i = 0; i < adlPositions.length; i++) {
            ITradingVault.Position memory adlPosition = adlPositions[i];
            uint256 orderId = tradingRouter.createDecreaseOrder(
                ITradingRouter.DecreasePositionRequest(
                    adlPosition.account,
                    adlPosition.pairIndex,
                    ITradingRouter.TradeType.MARKET,
                    0,
                    price,
                    adlPosition.positionAmount,
                    adlPosition.isLong
                ));
            _executeDecreaseOrder(orderId, ITradingRouter.TradeType.MARKET);
            console.log();
        }
        _executeDecreaseOrder(_orderId, order.tradeType);
    }


}
