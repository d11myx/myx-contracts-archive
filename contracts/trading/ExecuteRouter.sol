// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../libraries/access/Handleable.sol";
import "../libraries/PrecisionUtils.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../price/interfaces/IVaultPriceFeed.sol";

import "./interfaces/IExecuteRouter.sol";
import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "hardhat/console.sol";

contract ExecuteRouter is IExecuteRouter, ReentrancyGuardUpgradeable, Handleable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;


    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        ITradingRouter.TradeType tradeType,
        uint256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price
    );
    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        ITradingRouter.TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price
    );
    event LiquidatePosition(
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 collateral,
        int256 pnl,
        uint256 price
    );

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IVaultPriceFeed public vaultPriceFeed;

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
        IVaultPriceFeed _vaultPriceFeed,
        uint256 _maxTimeDelay
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        vaultPriceFeed = _vaultPriceFeed;
        maxTimeDelay = _maxTimeDelay;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IVaultPriceFeed _vaultPriceFeed
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function setPositionKeeper(address _account, bool _enable) external onlyGov {
        isPositionKeeper[_account] = _enable;
    }

    function setMaxTimeDelay(uint256 _maxTimeDelay) external onlyGov {
        maxTimeDelay = _maxTimeDelay;
    }

    // 批量执行市价加仓订单
    function executeIncreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = tradingRouter.increaseMarketOrderStartIndex();
        uint256 length = tradingRouter.increaseMarketOrdersIndex();
        console.log("executeIncreaseMarketOrders index %s length %s endIndex %s", index, length, _endIndex);
        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeIncreaseOrder(index, ITradingRouter.TradeType.MARKET) {
                console.log("executeIncreaseMarketOrder success index", index, "_endIndex", _endIndex);
            } catch Error(string memory reason) {
                console.log("executeIncreaseMarketOrder error ", reason);
                tradingRouter.cancelIncreaseOrder(index, ITradingRouter.TradeType.MARKET);
            }
            tradingRouter.removeFromIncreaseMarketOrders(index);
            index++;
        }
        tradingRouter.setIncreaseMarketOrderStartIndex(index);
    }

    // 执行加仓订单
    function executeIncreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        console.log("executeIncreaseOrder account", msg.sender);
        console.log("executeIncreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        ITradingRouter.IncreasePositionOrder memory order = tradingRouter.getIncreaseOrder(_orderId, _tradeType);

        // 请求已执行或已取消
        if (order.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == ITradingRouter.TradeType.MARKET) {
            console.log("executeIncreaseOrder blockTime", order.blockTime, "current timestamp", block.timestamp);
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        uint256 price = vaultPriceFeed.getPrice(pair.indexToken, order.isLong, false, false);

        // check price
        console.log("executeIncreaseOrder check price");
        if (order.tradeType == ITradingRouter.TradeType.MARKET) {
            require(order.isLong ? price <= order.openPrice : price >= order.openPrice, "exceed acceptable price");
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, "not reach trigger price");
        }

        // check
        require(order.sizeAmount >= order.collateral.divPrice(price) * tradingConfig.minLeverage
            && order.sizeAmount <= order.collateral.divPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");
        require(!tradingVault.isFrozen(order.account), "account is frozen");

        bytes32 key = tradingVault.getPositionKey(order.account, order.pairIndex, order.isLong);
        require(order.tp == 0 || !tradingRouter.positionHasTpSl(key, ITradingRouter.TradeType.TP), "tp already exists");
        require(order.sl == 0 || !tradingRouter.positionHasTpSl(key, ITradingRouter.TradeType.SL), "sl already exists");

        // 检查交易量
        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("increasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(- preNetExposureAmountChecker));
        if (preNetExposureAmountChecker >= 0) {
            // 偏向多头
            if (order.isLong) {
                // 买入单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("increasePosition sizeAmount", order.sizeAmount, "availableIndex", availableIndex);
                require(order.sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                // 卖出单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("increasePosition sizeAmount", order.sizeAmount, "availableStable", availableStable);
                require(order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (order.isLong) {
                // 卖出单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= uint256(- preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                // 买入单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        // trading vault
        tradingRouter.transferToVault(pair.stableToken, order.collateral);
        tradingVault.increasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong);

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

        // 添加止盈止损
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
            price
        );
    }


    // 批量执行市价加仓订单
    function executeDecreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = tradingRouter.decreaseMarketOrderStartIndex();
        uint256 length = tradingRouter.decreaseMarketOrdersIndex();
        console.log("executeDecreaseMarketOrders index %s length %s endIndex %s", index, length, _endIndex);
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
            tradingRouter.removeFromDecreaseMarketOrders(index);
            index++;
        }
        tradingRouter.setDecreaseMarketOrderStartIndex(index);
    }

    // 执行减仓订单
    function executeDecreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        console.log("executeDecreaseOrder account", msg.sender);
        console.log("executeDecreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        ITradingRouter.DecreasePositionOrder memory order = tradingRouter.getDecreaseOrder(_orderId, _tradeType);

        // 请求已执行或已取消
        if (order.account == address(0)) {
            console.log("executeDecreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == ITradingRouter.TradeType.MARKET) {
            console.log("executeDecreaseOrder blockTime", order.blockTime, "current timestamp", block.timestamp);
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        ITradingVault.Position memory position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.account == address(0)) {
            console.log("position is closed");
            return;
        }

        // todo 交易后的持仓量不小于0
        //        require(order.sizeAmount <=
        //            tradingVault.getPosition(account, order.pairIndex, order.isLong).positionAmount, "invalid decrease amount");

        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);

        uint256 price = vaultPriceFeed.getPrice(pair.indexToken, order.isLong, false, false);

        // check price
        require(order.abovePrice ? price <= order.triggerPrice : price >= order.triggerPrice, "not reach trigger price");

        // 检查交易量 todo ADL
        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("decreasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(- preNetExposureAmountChecker));
        if (preNetExposureAmountChecker >= 0) {
            // 偏向多头
            if (!order.isLong) {
                // 关空单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("decreasePosition sizeAmount", order.sizeAmount, "availableIndex", availableIndex);
                require(order.sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                // 关多单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("decreasePosition sizeAmount", order.sizeAmount, "availableStable", availableStable);
                require(order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (!order.isLong) {
                // 关空单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= uint256(- preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                // 关多单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        tradingVault.decreasePosition(order.account, pairIndex, order.sizeAmount, order.isLong);

        bytes32 key = tradingVault.getPositionKey(order.account, order.pairIndex, order.isLong);

        if (_tradeType == ITradingRouter.TradeType.MARKET) {
            tradingRouter.removeFromDecreaseMarketOrders(_orderId);
        } else if (_tradeType == ITradingRouter.TradeType.LIMIT) {
            tradingRouter.removeFromDecreaseLimitOrders(_orderId);
        } else {
            tradingRouter.setPositionHasTpSl(key, _tradeType, false);
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

        // 仓位清零后 取消所有减仓委托
        position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            tradingRouter.cancelAllPositionOrders(order.account, order.pairIndex, order.isLong);
        }

        emit ExecuteDecreaseOrder(
            order.account,
            _orderId,
            pairIndex,
            _tradeType,
            order.isLong,
            order.sizeAmount,
            price
        );
    }

    function liquidatePositions(bytes32[] memory _positionKeys, uint256[] memory _indexPrice) external nonReentrant onlyPositionKeeper {
        require(_positionKeys.length == _indexPrice.length, "length not match");

        for (uint256 i = 0; i < _positionKeys.length; i++) {
            _liquidatePosition(_positionKeys[i], _indexPrice[i]);
        }
    }

    function _liquidatePosition(bytes32 _positionKey, uint256 _indexPrice) internal {
        console.log("liquidatePosition start");
        ITradingVault.Position memory position = tradingVault.getPositionByKey(_positionKey);

        // 仓位已关闭
        if (position.account == address(0)) {
            console.log("position not exists");
            return;
        }

        IPairInfo.Pair memory pair = pairInfo.getPair(position.pairIndex);

        // 预言机价格
        uint256 price = vaultPriceFeed.getPrice(pair.indexToken, position.isLong, false, false);
        require(_indexPrice >= price.mulPercentage(10000 - 50) && _indexPrice <= price.mulPercentage(10000 + 50), "index price exceed max offset");

        // 仓位pnl
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
        // 仓位净资产
        int256 exposureAsset = int256(position.collateral) + unrealizedPnl;

        bool needLiquidate;
        if (exposureAsset <= 0) {
            needLiquidate = true;
        } else {
            IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);
            uint256 riskRate = position.positionAmount.mulPrice(_indexPrice).mulPercentage(tradingConfig.maintainMarginRate)
            .calculatePercentage(uint256(exposureAsset));
            needLiquidate = riskRate >= PrecisionUtils.oneHundredPercentage();
        }
        console.log("increasePosition needLiquidate", needLiquidate);

        // 检查交易量 todo ADL
        IPairVault.Vault memory lpVault = pairVault.getVault(position.pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(position.pairIndex);
        console.log("decreasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(- preNetExposureAmountChecker));
        if (preNetExposureAmountChecker >= 0) {
            // 偏向多头
            if (!position.isLong) {
                // 买入单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("decreasePosition positionAmount", position.positionAmount, "availableIndex", availableIndex);
                require(position.positionAmount <= availableIndex, "lp index token not enough");
            } else {
                // 卖出单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("decreasePosition positionAmount", position.positionAmount, "availableStable", availableStable);
                require(position.positionAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (!position.isLong) {
                // 卖出单
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(position.positionAmount <= uint256(- preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                // 买入单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(position.positionAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        tradingVault.decreasePosition(position.account, position.pairIndex, position.positionAmount, position.isLong);

        // 仓位清零后 取消所有减仓委托
        tradingRouter.cancelAllPositionOrders(position.account, position.pairIndex, position.isLong);

        emit LiquidatePosition(
            position.account,
            position.pairIndex,
            position.isLong,
            position.positionAmount,
            position.collateral,
            unrealizedPnl,
            price
        );
    }

}
