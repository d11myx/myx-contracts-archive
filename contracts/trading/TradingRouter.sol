// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";

import "../price/interfaces/IVaultPriceFeed.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/PriceUtils.sol";
import "../libraries/access/Handleable.sol";

import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "hardhat/console.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable, Handleable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;

    enum TradeType {MARKET, LIMIT, TP, SL}

    struct IncreasePositionRequest {
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        uint256 collateral;            // 1e18 保证金数量
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        uint256 sizeAmount;            // 仓位数量
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
    }

    struct DecreasePositionRequest {
        uint256 pairIndex;
        TradeType tradeType;
        uint256 triggerPrice;          // 限价触发价格
        uint256 sizeAmount;            // 关单数量
        bool isLong;
    }

    struct CreateTpSlRequest {
        uint256 pairIndex;             // 币对index
        bool isLong;
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
    }

    struct IncreasePositionOrder {
        uint256 orderId;
        address account;
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        uint256 collateral;            // 1e18 保证金数量
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        uint256 sizeAmount;            // 仓位数量
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
        uint256 blockTime;
    }

    struct DecreasePositionOrder {
        uint256 orderId;
        address account;
        TradeType tradeType;
        uint256 pairIndex;
        uint256 triggerPrice;           // 限价触发价格
        uint256 sizeAmount;             // 关单数量
        bool isLong;
        bool abovePrice;                // 高于或低于触发价格
                                        // 市价单：开多 true 空 false
                                        // 限价单：开多 false 空 true
                                        // 止盈：多单 false 空单 true
                                        // 止损：多单 true 空单 false
        uint256 blockTime;
    }

    // 市价开仓
    event CreateIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradeType tradeType,
        uint256 collateral,
        uint256 openPrice,
        bool isLong,
        uint256 sizeAmount,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
    );

    event CreateDecreaseOrder(
        address account,
        uint256 orderId,
        TradeType tradeType,
        uint256 pairIndex,
        uint256 openPrice,
        uint256 sizeAmount,
        bool isLong,
        bool abovePrice
    );

    event ExecuteIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradeType tradeType,
        uint256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price
    );
    event ExecuteDecreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price
    );
    event CancelIncreaseOrder(address account, uint256 orderId, TradeType tradeType);
    event CancelDecreaseOrder(address account, uint256 orderId, TradeType tradeType);

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IVaultPriceFeed public vaultPriceFeed;

    uint256 public maxTimeDelay;

    // 市价请求
    mapping(uint256 => IncreasePositionOrder) public increaseMarketOrders;
    mapping(uint256 => DecreasePositionOrder) public decreaseMarketOrders;
    // 当前市价开仓请求最后index
    uint256 public increaseMarketOrdersIndex;
    uint256 public decreaseMarketOrdersIndex;
    // 当前市价开仓请求未执行订单起始index
    uint256 public increaseMarketOrderStartIndex;
    uint256 public decreaseMarketOrderStartIndex;

    // 限价请求
    mapping(uint256 => IncreasePositionOrder) public increaseLimitOrders;
    mapping(uint256 => DecreasePositionOrder) public decreaseLimitOrders;
    uint256 public increaseLimitOrdersIndex;
    uint256 public decreaseLimitOrdersIndex;

    // 仓位已委托减仓
    mapping(bytes32 => DecreasePositionOrder[]) public positionDecreaseOrders;
    mapping(bytes32 => mapping(bytes32 => uint256)) public positionDecreaseOrderIndex;
    // 用户已委托减仓总额
    mapping(bytes32 => uint256) public positionDecreaseTotalAmount;
    // 仓位是否已委托TP/SL
    mapping(bytes32 => mapping(TradeType => bool)) public positionHasTpSl;

    mapping(address => bool) public isPositionKeeper;

    modifier onlyPositionKeeper() {
        require(msg.sender == address(this) || isPositionKeeper[msg.sender], "only position keeper");
        _;
    }

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IVaultPriceFeed _vaultPriceFeed,
        uint256 _maxTimeDelay
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        vaultPriceFeed = _vaultPriceFeed;
        maxTimeDelay = _maxTimeDelay;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IVaultPriceFeed _vaultPriceFeed
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function setPositionKeeper(address _account, bool _enable) external onlyGov {
        isPositionKeeper[_account] = _enable;
    }

    function setMaxTimeDelay(uint256 _maxTimeDelay) external onlyGov {
        maxTimeDelay = _maxTimeDelay;
    }

    // 创建加仓订单
    function createIncreaseOrder(IncreasePositionRequest memory _request) external nonReentrant returns(uint256 orderId) {
        console.log("createIncreaseOrder account", msg.sender);
        console.log("createIncreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));

        address account = msg.sender;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);

        require(!tradingVault.isFrozen(account), "account is frozen");
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_request.pairIndex);
        uint256 price = _getPrice(pair.indexToken, _request.isLong);

        require(_request.sizeAmount >= _request.collateral.divPrice(price) * tradingConfig.minLeverage
            && _request.sizeAmount <= _request.collateral.divPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");

        require(_request.collateral > 0, "invalid collateral");
        require(_request.tp <= _request.sizeAmount && _request.sl <= _request.sizeAmount, "tp/sl exceeds max size");
        require(_request.sizeAmount >= tradingConfig.minOpenAmount && _request.sizeAmount <= tradingConfig.maxOpenAmount, "invalid size");

        bytes32 key = tradingVault.getPositionKey(account, _request.pairIndex, _request.isLong);
        require(_request.tp == 0 || !positionHasTpSl[key][TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradeType.SL], "sl already exists");

        IERC20(pair.stableToken).safeTransferFrom(account, address(this), _request.collateral);

        IncreasePositionOrder memory order = IncreasePositionOrder(
            increaseMarketOrdersIndex,
            account,
            _request.pairIndex,
            _request.tradeType,
            _request.collateral,
            _request.openPrice,
            _request.isLong,
            _request.sizeAmount,
            _request.tpPrice,
            _request.tp,
            _request.slPrice,
            _request.sl,
            block.timestamp
        );

        if (_request.tradeType == TradeType.MARKET) {
            orderId = increaseMarketOrdersIndex;
            increaseMarketOrders[increaseMarketOrdersIndex++] = order;
            console.log("orderId", orderId, "increaseMarketOrdersIndex", increaseMarketOrdersIndex);
        } else if (_request.tradeType == TradeType.LIMIT) {
            orderId = increaseLimitOrdersIndex;
            increaseLimitOrders[increaseLimitOrdersIndex++] = order;
            console.log("orderId", orderId, "increaseLimitOrdersIndex", increaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        emit CreateIncreaseOrder(
            account,
            orderId,
            _request.pairIndex,
            _request.tradeType,
            _request.collateral,
            _request.openPrice,
            _request.isLong,
            _request.sizeAmount,
            _request.tpPrice,
            _request.tp,
            _request.slPrice,
            _request.sl
        );
        return orderId;
    }

    // 批量执行市价加仓订单
    function executeIncreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = increaseMarketOrderStartIndex;
        uint256 length = increaseMarketOrdersIndex;
        console.log("executeIncreaseMarketOrders index %s length %s endIndex %s", index, length, _endIndex);
        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeIncreaseOrder(index, TradeType.MARKET) {
                console.log("executeIncreaseMarketOrder success index", index, "_endIndex", _endIndex);
            } catch Error(string memory reason) {
                console.log("executeIncreaseMarketOrder error ", reason);
                this.cancelIncreaseOrder(index, TradeType.MARKET);
            }
            delete increaseMarketOrders[index];
            index++;
        }
        increaseMarketOrderStartIndex = index;
    }

    // 执行加仓订单
    function executeIncreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        console.log("executeIncreaseOrder account", msg.sender);
        console.log("executeIncreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        IncreasePositionOrder memory order = _getIncreaseOrder(_orderId, _tradeType);

        // 请求已执行或已取消
        if (order.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == TradeType.MARKET) {
            console.log("executeIncreaseOrder blockTime", order.blockTime, "current timestamp", block.timestamp);
            require(order.blockTime + maxTimeDelay >= block.timestamp, "order expired");
        }

        // check pair enable
        uint256 pairIndex = order.pairIndex;
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        uint256 price = _getPrice(pair.indexToken, order.isLong);

        // check price
        console.log("executeIncreaseOrder check price");
        if (order.tradeType == TradeType.MARKET) {
            require(order.isLong ? price <= order.openPrice : price >= order.openPrice, "exceed acceptable price");
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, "not reach trigger price");
        }

        // check
        require(order.sizeAmount >= order.collateral.divPrice(price) * tradingConfig.minLeverage
            && order.sizeAmount <= order.collateral.divPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");
        require(!tradingVault.isFrozen(order.account), "account is frozen");

        bytes32 key = tradingVault.getPositionKey(order.account, order.pairIndex, order.isLong);
        require(order.tp == 0 || !positionHasTpSl[key][TradeType.TP], "tp already exists");
        require(order.sl == 0 || !positionHasTpSl[key][TradeType.SL], "sl already exists");

        // 检查交易量
        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("increasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(-preNetExposureAmountChecker));
        if (preNetExposureAmountChecker >= 0) {
            // 偏向多头
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("increasePosition sizeAmount", order.sizeAmount, "availableIndex", availableIndex);
                require(order.sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("increasePosition sizeAmount", order.sizeAmount, "availableStable", availableStable);
                require(order.sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.divPrice(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (order.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(order.sizeAmount <= uint256(-preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        // trading vault
        IERC20(pair.stableToken).safeTransfer(address(tradingVault), order.collateral);
        tradingVault.increasePosition(order.account, pairIndex, order.collateral, order.sizeAmount, order.isLong);

        // 添加止盈止损
        _createTpSl(
            CreateTpSlRequest(
                order.pairIndex,
                order.isLong,
                order.tpPrice,
                order.tp,
                order.slPrice,
                order.sl
            ),
            order.account
        );

//        if (order.tp > 0) {
//            DecreasePositionOrder memory tpOrder = DecreasePositionOrder(
//                order.account,
//                TradeType.TP,
//                pairIndex,
//                order.tpPrice,
//                order.tp,
//                order.isLong,
//                order.isLong ? true : false,
//                block.timestamp
//            );
//            uint256 tpOrderId = decreaseLimitOrdersIndex;
//            decreaseLimitOrders[decreaseLimitOrdersIndex++] = tpOrder;
//            positionHasTpSl[key][TradeType.TP] = true;
//
//            _addDecreaseOrderToPosition(tpOrder, tpOrderId);
//            positionDecreaseTotalAmount[key] += order.tp;
//
//            emit CreateDecreaseOrder(
//                order.account,
//                tpOrderId,
//                TradeType.TP,
//                pairIndex,
//                order.tpPrice,
//                order.tp,
//                order.isLong,
//                order.isLong ? true : false
//            );
//        }
//        if (order.sl > 0) {
//            DecreasePositionOrder memory slOrder = DecreasePositionOrder(
//                order.account,
//                TradeType.SL,
//                pairIndex,
//                order.slPrice,
//                order.sl,
//                order.isLong,
//                order.isLong ? false : true,
//                block.timestamp
//            );
//            uint256 slOrderId = decreaseLimitOrdersIndex;
//            decreaseLimitOrders[decreaseLimitOrdersIndex++] = slOrder;
//            positionHasTpSl[key][TradeType.SL] = true;
//            _addDecreaseOrderToPosition(slOrder, slOrderId);
//            positionDecreaseTotalAmount[key] += order.sl;
//
//            emit CreateDecreaseOrder(
//                order.account,
//                slOrderId,
//                TradeType.SL,
//                pairIndex,
//                order.slPrice,
//                order.sl,
//                order.isLong,
//                order.isLong ? false : true
//            );
//        }
        if (_tradeType == TradeType.MARKET) {
            delete increaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            delete increaseLimitOrders[_orderId];
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

    // 取消加仓订单
    function cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant {
        console.log("cancelIncreaseOrder account", msg.sender);
        console.log("cancelIncreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        IncreasePositionOrder memory order = _getIncreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || msg.sender == order.account, "not order sender");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        IERC20(pair.stableToken).safeTransfer(order.account, order.collateral);

        if (_tradeType == TradeType.MARKET) {
            delete increaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            delete increaseLimitOrders[_orderId];
        }

        emit CancelIncreaseOrder(order.account, _orderId, _tradeType);
    }

    // 创建减仓订单
    function createDecreaseOrder(DecreasePositionRequest memory _request) external nonReentrant returns(uint256 orderId) {
        console.log("createDecreaseOrder account", msg.sender);
        console.log("createDecreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));
        address account = msg.sender;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);

        ITradingVault.Position memory position = tradingVault.getPosition(account, _request.pairIndex, _request.isLong);
        bytes32 positionKey = tradingVault.getPositionKey(account, _request.pairIndex, _request.isLong);
        require(_request.sizeAmount <= position.positionAmount - positionDecreaseTotalAmount[positionKey], "decrease amount exceed position");

        DecreasePositionOrder memory order = DecreasePositionOrder(
            decreaseMarketOrdersIndex,
            account,
            _request.tradeType,
            _request.pairIndex,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
            // 市价单：开多 true 空 false
            // 限价单：开多 false 空 true
            _request.tradeType == TradeType.MARKET ? _request.isLong : !_request.isLong,
            block.timestamp
        );

        if (_request.tradeType == TradeType.MARKET) {
            orderId = decreaseMarketOrdersIndex;
            decreaseMarketOrders[decreaseMarketOrdersIndex++] = order;
            console.log("orderId", orderId, "decreaseMarketOrdersIndex", decreaseMarketOrdersIndex);
        } else if (_request.tradeType == TradeType.LIMIT) {
            orderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;
            console.log("orderId", orderId, "decreaseLimitOrdersIndex", decreaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        // add decrease order
        _addDecreaseOrderToPosition(order);

        emit CreateDecreaseOrder(
            account,
            orderId,
            _request.tradeType,
            _request.pairIndex,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
            order.abovePrice
        );
        return orderId;
    }


    // 批量执行市价加仓订单
    function executeDecreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = decreaseMarketOrderStartIndex;
        uint256 length = decreaseMarketOrdersIndex;
        console.log("executeDecreaseMarketOrders index %s length %s endIndex %s", index, length, _endIndex);
        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeDecreaseOrder(index, TradeType.MARKET) {
                console.log("executeDecreaseMarketOrders success index", index, "_endIndex", _endIndex);
            } catch Error(string memory reason) {
                console.log("executeDecreaseMarketOrders error ", reason);
                this.cancelDecreaseOrder(index, TradeType.MARKET);
            }
            delete decreaseMarketOrders[index];
            index++;
        }
        decreaseMarketOrderStartIndex = index;
    }

    // 执行减仓订单
    function executeDecreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        console.log("executeDecreaseOrder account", msg.sender);
        console.log("executeDecreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        DecreasePositionOrder memory order = _getDecreaseOrder(_orderId, _tradeType);

        // 请求已执行或已取消
        if (order.account == address(0)) {
            console.log("executeDecreaseOrder not exists", _orderId);
            return;
        }

        // expire
        if (_tradeType == TradeType.MARKET) {
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

        uint256 price = _getPrice(pair.indexToken, order.isLong);

        // check price
        require(order.abovePrice ? price <= order.triggerPrice : price >= order.triggerPrice, "not reach trigger price");

        // 检查交易量 todo ADL
        IPairVault.Vault memory lpVault = pairVault.getVault(pairIndex);

        int256 preNetExposureAmountChecker = tradingVault.netExposureAmountChecker(order.pairIndex);
        console.log("decreasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(-preNetExposureAmountChecker));
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
                require(order.sizeAmount <= uint256(-preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                // 关多单
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(order.sizeAmount <= availableStable.divPrice(price), "lp stable token not enough");
            }
        }

        tradingVault.decreasePosition(order.account, pairIndex, order.sizeAmount, order.isLong);

        bytes32 key = tradingVault.getPositionKey(order.account, order.pairIndex, order.isLong);

        if (_tradeType == TradeType.MARKET) {
            delete decreaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            delete decreaseLimitOrders[_orderId];
        } else {
            positionHasTpSl[key][_tradeType] = false;
            delete decreaseLimitOrders[_orderId];
        }

        // remove decrease order
        _removeDecreaseOrderFromPosition(order);

        // 仓位清零后 取消所有减仓委托
        position = tradingVault.getPosition(order.account, order.pairIndex, order.isLong);
        if (position.positionAmount == 0) {
            uint256 length = positionDecreaseOrders[key].length;
            for (uint256 i = 0; i < length; i++) {
                DecreasePositionOrder memory decreasePositionOrder = positionDecreaseOrders[key][i];
                _cancelDecreaseOrder(decreasePositionOrder.account, decreasePositionOrder.orderId, decreasePositionOrder.tradeType);
            }
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

    function cancelDecreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant {
        _cancelDecreaseOrder(msg.sender, _orderId, _tradeType);
    }

    // 取消减仓订单
    function _cancelDecreaseOrder(address _account, uint256 _orderId, TradeType _tradeType) internal {
        console.log("cancelDecreaseOrder account", _account);
        console.log("cancelDecreaseOrder _orderId", _orderId, "_tradeType", uint8(_tradeType));

        DecreasePositionOrder memory order = _getDecreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }
        require(_account == order.account, "not order sender");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);
        bytes32 key = tradingVault.getPositionKey(order.account, order.pairIndex, order.isLong);

        _removeDecreaseOrderFromPosition(order);

        if (_tradeType == TradeType.MARKET) {
            delete decreaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            delete decreaseLimitOrders[_orderId];
        } else {
            positionHasTpSl[key][order.tradeType] = false;
            delete decreaseLimitOrders[_orderId];
        }

        emit CancelDecreaseOrder(order.account, _orderId, _tradeType);
    }

    // 创建止盈止损
    function createTpSl(CreateTpSlRequest memory request) external nonReentrant returns(uint256 tpOrderId, uint256 slOrderId) {
        return _createTpSl(request, msg.sender);
    }

    function _createTpSl(CreateTpSlRequest memory _request, address _account) internal returns(uint256 tpOrderId, uint256 slOrderId) {
        console.log("createTpSl account", _account);
        console.log("createTpSl pairIndex", _request.pairIndex, "createTpSl isLong", _request.isLong);

        require(!tradingVault.isFrozen(_account), "account is frozen");

        // check
        ITradingVault.Position memory position = tradingVault.getPosition(_account, _request.pairIndex, _request.isLong);

        require(_request.tp <= position.positionAmount && _request.sl <= position.positionAmount, "tp/sl exceeds max size");

        bytes32 key = tradingVault.getPositionKey(_account, _request.pairIndex, _request.isLong);
        require(_request.tp == 0 || !positionHasTpSl[key][TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradeType.SL], "sl already exists");

        if (_request.tp > 0) {
            DecreasePositionOrder memory tpOrder = DecreasePositionOrder(
                decreaseLimitOrdersIndex,
                _account,
                TradeType.TP,
                _request.pairIndex,
                _request.tpPrice,
                _request.tp,
                _request.isLong,
                _request.isLong ? true : false,
                block.timestamp
            );
            tpOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = tpOrder;
            positionHasTpSl[key][TradeType.TP] = true;
            _addDecreaseOrderToPosition(tpOrder);

            emit CreateDecreaseOrder(
                _account,
                tpOrderId,
                TradeType.TP,
                _request.pairIndex,
                _request.tpPrice,
                _request.tp,
                _request.isLong,
                _request.isLong ? true : false
            );
        }
        if (_request.sl > 0) {
            DecreasePositionOrder memory slOrder = DecreasePositionOrder(
                decreaseLimitOrdersIndex,
                _account,
                TradeType.SL,
                _request.pairIndex,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? false : true,
                block.timestamp
            );
            slOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = slOrder;
            positionHasTpSl[key][TradeType.SL] = true;
            _addDecreaseOrderToPosition(slOrder);

            emit CreateDecreaseOrder(
                _account,
                slOrderId,
                TradeType.SL,
                _request.pairIndex,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? false : true
            );
        }

        return (tpOrderId, slOrderId);
    }

    function _getIncreaseOrder(uint256 _orderId, TradeType _tradeType) internal returns(IncreasePositionOrder memory order) {
        if (_tradeType == TradeType.MARKET) {
            order = increaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            order = increaseLimitOrders[_orderId];
        } else {
            revert("invalid trade type");
        }
        return order;
    }

    function _getDecreaseOrder(uint256 _orderId, TradeType _tradeType) internal returns(DecreasePositionOrder memory order) {
        if (_tradeType == TradeType.MARKET) {
            order = decreaseMarketOrders[_orderId];
        } else {
            order = decreaseLimitOrders[_orderId];
            require(order.tradeType == _tradeType, "trade type not match");
        }
        return order;
    }

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }

    function _addDecreaseOrderToPosition(DecreasePositionOrder memory _order) internal {
        console.log("addDecreaseOrderToPosition");
        bytes32 orderKey = getOrderKey(_order.account, _order.tradeType, _order.orderId);
        bytes32 positionKey = tradingVault.getPositionKey(_order.account, _order.pairIndex, _order.isLong);
        positionDecreaseOrderIndex[positionKey][orderKey] = positionDecreaseOrders[positionKey].length;
        positionDecreaseOrders[positionKey].push(_order);

        if (_order.tradeType == TradeType.MARKET && _order.tradeType == TradeType.LIMIT) {
            positionDecreaseTotalAmount[positionKey] += _order.sizeAmount;
        }
    }

    function _removeDecreaseOrderFromPosition(DecreasePositionOrder memory _order) internal {
        console.log("removeDecreaseOrderFromPosition orderId", _order.orderId, "tradeType", uint8(_order.tradeType));
        bytes32 orderKey = getOrderKey(_order.account, _order.tradeType, _order.orderId);
        bytes32 positionKey = tradingVault.getPositionKey(_order.account, _order.pairIndex, _order.isLong);

        uint256 index = positionDecreaseOrderIndex[positionKey][orderKey];
        DecreasePositionOrder memory lastOrder = positionDecreaseOrders[positionKey][positionDecreaseOrders[positionKey].length - 1];
        bytes32 lastOrderKey = getOrderKey(lastOrder.account, lastOrder.tradeType, lastOrder.orderId);

        positionDecreaseOrders[positionKey][index] = lastOrder;
        positionDecreaseOrderIndex[positionKey][lastOrderKey] = index;

        positionDecreaseOrders[positionKey].pop();
        delete positionDecreaseOrderIndex[positionKey][lastOrderKey];

        if (_order.tradeType == TradeType.MARKET && _order.tradeType == TradeType.LIMIT) {
            positionDecreaseTotalAmount[positionKey] -= _order.sizeAmount;
        }
    }

    function getOrderKey(address _account, TradeType _tradeType, uint256 _orderId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _tradeType, _orderId));
    }
}
