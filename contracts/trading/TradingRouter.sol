// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";

import "../price/interfaces/IVaultPriceFeed.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/access/Handleable.sol";

import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "hardhat/console.sol";
import "./interfaces/ITradingUtils.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable, Handleable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;

    // 市价开仓
    event CreateIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradeType tradeType,
        int256 collateral,
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
        int256 collateral,
        uint256 pairIndex,
        uint256 openPrice,
        uint256 sizeAmount,
        bool isLong,
        bool abovePrice
    );

    event CancelIncreaseOrder(address account, uint256 orderId, TradeType tradeType);
    event CancelDecreaseOrder(address account, uint256 orderId, TradeType tradeType);

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingUtils public tradingUtils;

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

    // 用户订单列表
    mapping(bytes32 => PositionOrder[]) public positionOrders;
    // 仓位订单index
    mapping(bytes32 => mapping(bytes32 => uint256)) public positionOrderIndex;
    // 用户已委托减仓总额
    mapping(bytes32 => uint256) public positionDecreaseTotalAmount;
    // 仓位是否已委托TP/SL
    mapping(bytes32 => mapping(TradeType => bool)) public positionHasTpSl;

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingUtils _tradingUtils
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingUtils = _tradingUtils;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingUtils _tradingUtils
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingUtils = _tradingUtils;
    }

    // 创建加仓订单
    function createIncreaseOrder(IncreasePositionRequest memory _request) external nonReentrant returns (uint256 orderId) {
        console.log("createIncreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));
        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        address account = _request.account;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);

        require(!tradingVault.isFrozen(account), "account is frozen");
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_request.pairIndex);
        uint256 price = tradingUtils.getPrice(_request.pairIndex, _request.isLong);

        // check increase size
        require(_request.sizeAmount >= tradingConfig.minTradeAmount && _request.sizeAmount <= tradingConfig.maxTradeAmount, "invalid size");

        // check leverage
        bytes32 key = tradingUtils.getPositionKey(account, _request.pairIndex, _request.isLong);
        tradingUtils.validLeverage(_request.account, _request.pairIndex, _request.isLong, _request.collateral, _request.sizeAmount, true);

        // check tp sl
        require(_request.tp <= _request.sizeAmount && _request.sl <= _request.sizeAmount, "tp/sl exceeds max size");
        require(_request.tp == 0 || !positionHasTpSl[key][TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradeType.SL], "sl already exists");

        // transfer collateral
        if (_request.collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(this), _request.collateral.abs());
        }

        IncreasePositionOrder memory order = IncreasePositionOrder(
            0,
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
            order.orderId = increaseMarketOrdersIndex;
            increaseMarketOrders[increaseMarketOrdersIndex++] = order;
            console.log("orderId", order.orderId, "increaseMarketOrdersIndex", increaseMarketOrdersIndex);
        } else if (_request.tradeType == TradeType.LIMIT) {
            order.orderId = increaseLimitOrdersIndex;
            increaseLimitOrders[increaseLimitOrdersIndex++] = order;
            console.log("orderId", order.orderId, "increaseLimitOrdersIndex", increaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        addOrderToPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

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

    // 取消加仓订单
    function cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant {
        console.log("cancelIncreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        IncreasePositionOrder memory order = getIncreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        // transfer collateral
        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        removeOrderFromPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));

        if (_tradeType == TradeType.MARKET) {
            delete increaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            delete increaseLimitOrders[_orderId];
        }

        emit CancelIncreaseOrder(order.account, _orderId, _tradeType);
    }

    // 创建减仓订单
    function createDecreaseOrder(DecreasePositionRequest memory _request) external nonReentrant returns (uint256 orderId) {
        console.log("createDecreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));
        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        address account = _request.account;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_request.pairIndex);

        uint256 price = tradingUtils.getPrice(_request.pairIndex, _request.isLong);

        // check decrease size
        ITradingVault.Position memory position = tradingVault.getPosition(account, _request.pairIndex, _request.isLong);
        bytes32 positionKey = tradingUtils.getPositionKey(account, _request.pairIndex, _request.isLong);
        console.log("createDecreaseOrder sizeAmount %s positionAmount %s positionDecreaseTotalAmount %s",
            _request.sizeAmount, position.positionAmount, positionDecreaseTotalAmount[positionKey]);
        require(_request.sizeAmount <= position.positionAmount - positionDecreaseTotalAmount[positionKey], "decrease amount exceed position");

        // check leverage
        tradingUtils.validLeverage(position.account, position.pairIndex, position.isLong, _request.collateral, _request.sizeAmount, false);

        // transfer collateral
        if (_request.collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(this), _request.collateral.abs());
        }

        DecreasePositionOrder memory order = DecreasePositionOrder(
            0,
            account,
            _request.pairIndex,
            _request.tradeType,
            _request.collateral,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
        // 市价单：开多 true 空 false
        // 限价单：开多 false 空 true
            _request.tradeType == TradeType.MARKET ? _request.isLong : !_request.isLong,
            block.timestamp,
            false
        );

        if (_request.tradeType == TradeType.MARKET) {
            order.orderId = decreaseMarketOrdersIndex;
            decreaseMarketOrders[decreaseMarketOrdersIndex++] = order;
            console.log("orderId", order.orderId, "decreaseMarketOrdersIndex", decreaseMarketOrdersIndex);
        } else if (_request.tradeType == TradeType.LIMIT) {
            order.orderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;
            console.log("orderId", order.orderId, "decreaseLimitOrdersIndex", decreaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        // add decrease order
        addOrderToPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

        emit CreateDecreaseOrder(
            account,
            orderId,
            _request.tradeType,
            _request.collateral,
            _request.pairIndex,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
            order.abovePrice
        );
        return orderId;
    }

    // 取消减仓订单
    function cancelDecreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant {
        DecreasePositionOrder memory order = getDecreaseOrder(_orderId, _tradeType);
        console.log("cancelDecreaseOrder orderId", _orderId, "tradeType", uint8(order.tradeType));
        console.log("cancelDecreaseOrder account", order.account);

        if (order.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);
        bytes32 key = tradingUtils.getPositionKey(order.account, order.pairIndex, order.isLong);

        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        removeOrderFromPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));

        if (order.tradeType == TradeType.MARKET) {
            delete decreaseMarketOrders[_orderId];
        } else if (order.tradeType == TradeType.LIMIT) {
            delete decreaseLimitOrders[_orderId];
        } else {
            positionHasTpSl[key][order.tradeType] = false;
            delete decreaseLimitOrders[_orderId];
        }

        emit CancelDecreaseOrder(order.account, _orderId, order.tradeType);
    }

    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external {
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == account, "not order sender or handler");

        bytes32 key = tradingUtils.getPositionKey(account, pairIndex, isLong);

        while (positionOrders[key].length > 0) {
            uint256 lastIndex = positionOrders[key].length - 1;
            PositionOrder memory positionOrder = positionOrders[key][lastIndex];
            console.log("positionOrder lastIndex", lastIndex, "orderId", positionOrder.orderId);
            console.log("positionOrder tradeType", uint8(positionOrder.tradeType), "isIncrease", positionOrder.isIncrease);
            if (positionOrder.isIncrease) {
                this.cancelIncreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            } else {
                this.cancelDecreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            }
        }
    }

    // 创建止盈止损
    function createTpSl(CreateTpSlRequest memory _request) external returns (uint256 tpOrderId, uint256 slOrderId) {
        console.log("createTpSl pairIndex", _request.pairIndex, "createTpSl isLong", _request.isLong);
        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        // check
        ITradingVault.Position memory position = tradingVault.getPosition(_request.account, _request.pairIndex, _request.isLong);

        require(_request.tp <= position.positionAmount && _request.sl <= position.positionAmount, "tp/sl exceeds max size");

        bytes32 key = tradingUtils.getPositionKey(_request.account, _request.pairIndex, _request.isLong);
        require(_request.tp == 0 || !positionHasTpSl[key][TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradeType.SL], "sl already exists");

        if (_request.tp > 0) {
            DecreasePositionOrder memory tpOrder = DecreasePositionOrder(
                decreaseLimitOrdersIndex,
                _request.account,
                _request.pairIndex,
                TradeType.TP,
                0,
                _request.tpPrice,
                _request.tp,
                _request.isLong,
                _request.isLong ? true : false,
                block.timestamp,
                false
            );
            tpOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = tpOrder;
            positionHasTpSl[key][TradeType.TP] = true;
            addOrderToPosition(
                PositionOrder(
                    tpOrder.account,
                    tpOrder.pairIndex,
                    tpOrder.isLong,
                    false,
                    tpOrder.tradeType,
                    tpOrder.orderId,
                    tpOrder.sizeAmount
                ));

            emit CreateDecreaseOrder(
                _request.account,
                tpOrderId,
                TradeType.TP,
                0,
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
                _request.account,
                _request.pairIndex,
                TradeType.SL,
                0,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? false : true,
                block.timestamp,
                false
            );
            slOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = slOrder;
            positionHasTpSl[key][TradeType.SL] = true;
            addOrderToPosition(
                PositionOrder(
                    slOrder.account,
                    slOrder.pairIndex,
                    slOrder.isLong,
                    false,
                    slOrder.tradeType,
                    slOrder.orderId,
                    slOrder.sizeAmount
                ));

            emit CreateDecreaseOrder(
                _request.account,
                slOrderId,
                TradeType.SL,
                0,
                _request.pairIndex,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? false : true
            );
        }

        return (tpOrderId, slOrderId);
    }

    function getIncreaseOrder(uint256 _orderId, TradeType _tradeType) public view returns (IncreasePositionOrder memory order) {
        if (_tradeType == TradeType.MARKET) {
            order = increaseMarketOrders[_orderId];
        } else if (_tradeType == TradeType.LIMIT) {
            order = increaseLimitOrders[_orderId];
        } else {
            revert("invalid trade type");
        }
        return order;
    }

    function getDecreaseOrder(uint256 _orderId, TradeType _tradeType) public view returns (DecreasePositionOrder memory order) {
        if (_tradeType == TradeType.MARKET) {
            order = decreaseMarketOrders[_orderId];
        } else {
            order = decreaseLimitOrders[_orderId];
        }
        return order;
    }

    function getPositionOrders(bytes32 key) external returns (PositionOrder[] memory orders) {
        return positionOrders[key];
    }

    function addOrderToPosition(PositionOrder memory _order) public onlyHandler {
        bytes32 positionKey = tradingUtils.getPositionKey(_order.account, _order.pairIndex, _order.isLong);
        bytes32 orderKey = tradingUtils.getOrderKey(_order.isIncrease, _order.tradeType, _order.orderId);
        positionOrderIndex[positionKey][orderKey] = positionOrders[positionKey].length;
        positionOrders[positionKey].push(_order);
        console.log("positionOrders add orderId", _order.orderId, "tradeType", uint8(_order.tradeType));

        if (!_order.isIncrease && _order.tradeType == TradeType.MARKET && _order.tradeType == TradeType.LIMIT) {
            positionDecreaseTotalAmount[positionKey] += _order.sizeAmount;
        }
    }

    function removeOrderFromPosition(PositionOrder memory _order) public onlyHandler {
        console.log("removeOrderFromPosition account %s orderId %s tradeType %s ", _order.account, _order.orderId, uint8(_order.tradeType));
        bytes32 positionKey = tradingUtils.getPositionKey(_order.account, _order.pairIndex, _order.isLong);
        bytes32 orderKey = tradingUtils.getOrderKey(_order.isIncrease, _order.tradeType, _order.orderId);

        uint256 index = positionOrderIndex[positionKey][orderKey];
        uint256 lastIndex = positionOrders[positionKey].length - 1;

        if (index < lastIndex) {
            // swap last order
            PositionOrder memory lastOrder = positionOrders[positionKey][positionOrders[positionKey].length - 1];
            bytes32 lastOrderKey = tradingUtils.getOrderKey(lastOrder.isIncrease, lastOrder.tradeType, lastOrder.orderId);

            positionOrders[positionKey][index] = lastOrder;
            positionOrderIndex[positionKey][lastOrderKey] = index;
        }
        delete positionOrderIndex[positionKey][orderKey];
        positionOrders[positionKey].pop();
        console.log("positionOrders remove orderId", _order.orderId, "tradeType", uint8(_order.tradeType));

        if (!_order.isIncrease && _order.tradeType == TradeType.MARKET && _order.tradeType == TradeType.LIMIT) {
            positionDecreaseTotalAmount[positionKey] -= _order.sizeAmount;
        }
    }

    function setIncreaseMarketOrderStartIndex(uint256 index) external onlyHandler {
        increaseMarketOrderStartIndex = index;
    }

    function setDecreaseMarketOrderStartIndex(uint256 index) external onlyHandler {
        decreaseMarketOrderStartIndex = index;
    }

    function setPositionHasTpSl(bytes32 key, TradeType tradeType, bool has) external onlyHandler {
        positionHasTpSl[key][tradeType] = has;
    }

    function removeFromIncreaseMarketOrders(uint256 orderId) external onlyHandler {
        delete increaseMarketOrders[orderId];
    }

    function removeFromIncreaseLimitOrders(uint256 orderId) external onlyHandler {
        delete increaseLimitOrders[orderId];
    }

    function removeFromDecreaseMarketOrders(uint256 orderId) external onlyHandler {
        delete decreaseMarketOrders[orderId];
    }

    function removeFromDecreaseLimitOrders(uint256 orderId) external onlyHandler {
        delete decreaseLimitOrders[orderId];
    }

    function transferToVault(address token, uint256 amount) external onlyHandler {
        IERC20(token).safeTransfer(address(tradingVault), amount);
    }

    function setOrderNeedADL(uint256 _orderId, TradeType _tradeType, bool _needADL) external onlyHandler {
        DecreasePositionOrder storage order;
        if (_tradeType == TradeType.MARKET) {
            order = decreaseMarketOrders[_orderId];
        } else {
            order = decreaseLimitOrders[_orderId];
            require(order.tradeType == _tradeType, "trade type not match");
        }
        order.needADL = _needADL;
    }

}
