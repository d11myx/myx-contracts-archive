// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../libraries/Position.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PositionKey.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/PositionKey.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/type/TradingTypes.sol";

import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "hardhat/console.sol";
import "./interfaces/ITradingUtils.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable, Handleable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;


    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingUtils public tradingUtils;


    mapping(uint256 => TradingTypes.IncreasePositionOrder) internal increaseMarketOrders;
    mapping(uint256 => TradingTypes.DecreasePositionOrder) internal decreaseMarketOrders;

    uint256 public override increaseMarketOrdersIndex;
    uint256 public override decreaseMarketOrdersIndex;

    uint256 public override increaseMarketOrderStartIndex;
    uint256 public override decreaseMarketOrderStartIndex;


    mapping(uint256 => TradingTypes.IncreasePositionOrder) internal increaseLimitOrders;
    mapping(uint256 => TradingTypes.DecreasePositionOrder) internal decreaseLimitOrders;
    uint256 public override increaseLimitOrdersIndex;
    uint256 public override decreaseLimitOrdersIndex;


    mapping(bytes32 => TradingTypes.PositionOrder[]) public positionOrders;

    mapping(bytes32 => mapping(bytes32 => uint256)) public positionOrderIndex;

    mapping(bytes32 => uint256) public positionDecreaseTotalAmount;

    mapping(bytes32 => mapping(TradingTypes.TradeType => bool)) public positionHasTpSl;

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

    function getIncreaseMarketOrder(uint256 index) public view override returns(TradingTypes.IncreasePositionOrder memory) {
        return increaseMarketOrders[index];
    }

    function getDecreaseMarketOrder(uint256 index) public view override returns(TradingTypes.DecreasePositionOrder memory) {
        return decreaseMarketOrders[index];
    }

    function getIncreaseLimitOrder(uint256 index) public view override returns(TradingTypes.IncreasePositionOrder memory) {
        return increaseLimitOrders[index];
    }

    function getDecreaseLimitOrder(uint256 index) external view returns(TradingTypes.DecreasePositionOrder memory) {
        return decreaseLimitOrders[index];
    }

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) external nonReentrant returns (uint256) {
        console.log("createIncreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));
        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        address account = _request.account;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);

        require(!tradingVault.isFrozen(account), "account is frozen");
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_request.pairIndex);
        uint256 price = tradingUtils.getPrice(_request.pairIndex, _request.isLong);

        // check increase size
        require(_request.sizeAmount == 0 || (_request.sizeAmount >= tradingConfig.minTradeAmount && _request.sizeAmount <= tradingConfig.maxTradeAmount), "invalid trade size");

        // check leverage
        bytes32 key = PositionKey.getPositionKey(account, _request.pairIndex, _request.isLong);
        (uint256 afterPosition, ) = tradingUtils.validLeverage(_request.account, _request.pairIndex, _request.isLong, _request.collateral, _request.sizeAmount, true);
        require(afterPosition > 0, "zero position amount");

        // check tp sl
        require(_request.tp <= afterPosition && _request.sl <= afterPosition, "tp/sl exceeds max size");
        require(_request.tp == 0 || !positionHasTpSl[key][TradingTypes.TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradingTypes.TradeType.SL], "sl already exists");

        // transfer collateral
        if (_request.collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(this), _request.collateral.abs());
        }

        TradingTypes.IncreasePositionOrder memory order = TradingTypes.IncreasePositionOrder(
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

        if (_request.tradeType == TradingTypes.TradeType.MARKET) {
            order.orderId = increaseMarketOrdersIndex;
            increaseMarketOrders[increaseMarketOrdersIndex++] = order;
            console.log("orderId", order.orderId, "increaseMarketOrdersIndex", increaseMarketOrdersIndex);
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = increaseLimitOrdersIndex;
            increaseLimitOrders[increaseLimitOrdersIndex++] = order;
            console.log("orderId", order.orderId, "increaseLimitOrdersIndex", increaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        this.addOrderToPosition(
            TradingTypes.PositionOrder(
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
            order.orderId,
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
        return order.orderId;
    }


    function cancelIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public nonReentrant {
        console.log("cancelIncreaseOrder orderId", _orderId, "tradeType", uint8(_tradeType));

        TradingTypes.IncreasePositionOrder memory order = getIncreaseOrder(_orderId, _tradeType);

        if (order.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        // transfer collateral
        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        this.removeOrderFromPosition(
            TradingTypes.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));

        if (_tradeType == TradingTypes.TradeType.MARKET) {
            this.removeFromIncreaseMarketOrders(_orderId);
        } else if (_tradeType == TradingTypes.TradeType.LIMIT) {
            this.removeFromIncreaseLimitOrders(_orderId);
        }

        emit CancelIncreaseOrder(order.account, _orderId, _tradeType);
    }


    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) external nonReentrant returns (uint256) {
        console.log("createDecreaseOrder pairIndex", _request.pairIndex, "tradeType", uint8(_request.tradeType));
        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        address account = _request.account;

        IPairInfo.Pair memory pair = pairInfo.getPair(_request.pairIndex);
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_request.pairIndex);

        uint256 price = tradingUtils.getPrice(_request.pairIndex, _request.isLong);

        // check decrease size
        Position.Info memory position = tradingVault.getPosition(account, _request.pairIndex, _request.isLong);
        bytes32 positionKey = PositionKey.getPositionKey(account, _request.pairIndex, _request.isLong);
        console.log("createDecreaseOrder sizeAmount %s positionAmount %s positionDecreaseTotalAmount %s",
            _request.sizeAmount, position.positionAmount, positionDecreaseTotalAmount[positionKey]);
        require(_request.sizeAmount <= position.positionAmount - positionDecreaseTotalAmount[positionKey], "decrease amount exceed position");
        require(_request.sizeAmount == 0 || (_request.sizeAmount >= tradingConfig.minTradeAmount && _request.sizeAmount <= tradingConfig.maxTradeAmount), "invalid trade size");

        // check leverage
        tradingUtils.validLeverage(position.account, position.pairIndex, position.isLong, _request.collateral, _request.sizeAmount, false);

        // transfer collateral
        if (_request.collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(this), _request.collateral.abs());
        }

        TradingTypes.DecreasePositionOrder memory order = TradingTypes.DecreasePositionOrder(
            0,
            account,
            _request.pairIndex,
            _request.tradeType,
            _request.collateral,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,

            _request.tradeType == TradingTypes.TradeType.MARKET ? _request.isLong : !_request.isLong,
            block.timestamp,
            false
        );

        if (_request.tradeType == TradingTypes.TradeType.MARKET) {
            order.orderId = decreaseMarketOrdersIndex;
            decreaseMarketOrders[decreaseMarketOrdersIndex++] = order;
            console.log("orderId", order.orderId, "decreaseMarketOrdersIndex", decreaseMarketOrdersIndex);
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;
            console.log("orderId", order.orderId, "decreaseLimitOrdersIndex", decreaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        // add decrease order
        this.addOrderToPosition(
            TradingTypes.PositionOrder(
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
            order.orderId,
            _request.tradeType,
            _request.collateral,
            _request.pairIndex,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
            order.abovePrice
        );
        return order.orderId;
    }


    function cancelDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public nonReentrant {
        TradingTypes.DecreasePositionOrder memory order = getDecreaseOrder(_orderId, _tradeType);
        console.log("cancelDecreaseOrder orderId", _orderId, "tradeType", uint8(order.tradeType));
        console.log("cancelDecreaseOrder account", order.account);

        if (order.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);
        bytes32 key = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);

        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        this.removeOrderFromPosition(
            TradingTypes.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                _orderId,
                order.sizeAmount
            ));

        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            this.removeFromDecreaseMarketOrders(_orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            this.removeFromDecreaseLimitOrders(_orderId);
        } else {
            this.setPositionHasTpSl(key, order.tradeType, false);
            this.removeFromDecreaseLimitOrders(_orderId);
        }

        emit CancelDecreaseOrder(order.account, _orderId, order.tradeType);
    }

    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external {
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == account, "not order sender or handler");

        bytes32 key = PositionKey.getPositionKey(account, pairIndex, isLong);

        while (positionOrders[key].length > 0) {
            uint256 lastIndex = positionOrders[key].length - 1;
            TradingTypes.PositionOrder memory positionOrder = positionOrders[key][lastIndex];
            console.log("positionOrder lastIndex", lastIndex, "orderId", positionOrder.orderId);
            console.log("positionOrder tradeType", uint8(positionOrder.tradeType), "isIncrease", positionOrder.isIncrease);
            if (positionOrder.isIncrease) {
                this.cancelIncreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            } else {
                this.cancelDecreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            }
        }
    }

    function cancelOrders(address account, uint256 pairIndex, bool isLong, bool isIncrease) external {
        require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == account, "not order sender or handler");

        bytes32 key = PositionKey.getPositionKey(account, pairIndex, isLong);

        for (uint256 i = 0; i < positionOrders[key].length; i++) {
            TradingTypes.PositionOrder memory positionOrder = positionOrders[key][i];
            console.log("positionOrder index", i, "orderId", positionOrder.orderId);
            console.log("positionOrder tradeType", uint8(positionOrder.tradeType), "isIncrease", positionOrder.isIncrease);
            if (isIncrease && positionOrder.isIncrease) {
                this.cancelIncreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            } else if (!isIncrease && !positionOrder.isIncrease) {
                this.cancelDecreaseOrder(positionOrder.orderId, positionOrder.tradeType);
            }
        }
    }


    function createTpSl(TradingTypes.CreateTpSlRequest memory _request) external returns (uint256 tpOrderId, uint256 slOrderId) {
        console.log("createTpSl pairIndex", _request.pairIndex, "isLong", _request.isLong);
        console.log("createTpSl tp", _request.tp, "sl", _request.sl);

        require(isHandler[msg.sender] || msg.sender == _request.account, "not order sender or handler");

        // check
        Position.Info memory position = tradingVault.getPosition(_request.account, _request.pairIndex, _request.isLong);

        require(_request.tp <= position.positionAmount && _request.sl <= position.positionAmount, "tp/sl exceeds max size");

        bytes32 key = PositionKey.getPositionKey(_request.account, _request.pairIndex, _request.isLong);
        require(_request.tp == 0 || !positionHasTpSl[key][TradingTypes.TradeType.TP], "tp already exists");
        require(_request.sl == 0 || !positionHasTpSl[key][TradingTypes.TradeType.SL], "sl already exists");

        if (_request.tp > 0) {
            TradingTypes.DecreasePositionOrder memory tpOrder = TradingTypes.DecreasePositionOrder(
                decreaseLimitOrdersIndex,
                _request.account,
                _request.pairIndex,
                TradingTypes.TradeType.TP,
                0,
                _request.tpPrice,
                _request.tp,
                _request.isLong,
                _request.isLong ? false : true,
                block.timestamp,
                false
            );
            tpOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = tpOrder;
            positionHasTpSl[key][TradingTypes.TradeType.TP] = true;
            this.addOrderToPosition(
                TradingTypes.PositionOrder(
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
                TradingTypes.TradeType.TP,
                0,
                _request.pairIndex,
                _request.tpPrice,
                _request.tp,
                _request.isLong,
                _request.isLong ? false : true
            );
            console.log("createTpSl tp", _request.tp);
        }
        if (_request.sl > 0) {
            TradingTypes.DecreasePositionOrder memory slOrder = TradingTypes.DecreasePositionOrder(
                decreaseLimitOrdersIndex,
                _request.account,
                _request.pairIndex,
                TradingTypes.TradeType.SL,
                0,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? true : false,
                block.timestamp,
                false
            );
            slOrderId = decreaseLimitOrdersIndex;
            decreaseLimitOrders[decreaseLimitOrdersIndex++] = slOrder;
            positionHasTpSl[key][TradingTypes.TradeType.SL] = true;
            this.addOrderToPosition(
                TradingTypes.PositionOrder(
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
                TradingTypes.TradeType.SL,
                0,
                _request.pairIndex,
                _request.slPrice,
                _request.sl,
                _request.isLong,
                _request.isLong ? true : false
            );
            console.log("createTpSl sl", _request.sl);
        }

        return (tpOrderId, slOrderId);
    }

    function getIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public view returns (TradingTypes.IncreasePositionOrder memory order) {
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            order = increaseMarketOrders[_orderId];
        } else if (_tradeType == TradingTypes.TradeType.LIMIT) {
            order = increaseLimitOrders[_orderId];
        } else {
            revert("invalid trade type");
        }
        return order;
    }

    function getDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) public view returns (TradingTypes.DecreasePositionOrder memory order) {
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            order = decreaseMarketOrders[_orderId];
        } else {
            order = decreaseLimitOrders[_orderId];
        }
        return order;
    }

    function getPositionOrders(bytes32 key) external view returns (TradingTypes.PositionOrder[] memory orders) {
        return positionOrders[key];
    }

    function addOrderToPosition(TradingTypes.PositionOrder memory _order) public onlyHandler {
        bytes32 positionKey = PositionKey.getPositionKey(_order.account, _order.pairIndex, _order.isLong);
        bytes32 orderKey = PositionKey.getOrderKey(_order.isIncrease, _order.tradeType, _order.orderId);
        positionOrderIndex[positionKey][orderKey] = positionOrders[positionKey].length;
        positionOrders[positionKey].push(_order);
        console.log("positionOrders add orderId", _order.orderId, "tradeType", uint8(_order.tradeType));

        if (!_order.isIncrease && (_order.tradeType == TradingTypes.TradeType.MARKET || _order.tradeType == TradingTypes.TradeType.LIMIT)) {
            positionDecreaseTotalAmount[positionKey] += _order.sizeAmount;
        }
    }

    function removeOrderFromPosition(TradingTypes.PositionOrder memory _order) public onlyHandler {
        console.log("removeOrderFromPosition account %s orderId %s tradeType %s ", _order.account, _order.orderId, uint8(_order.tradeType));
        bytes32 positionKey = PositionKey.getPositionKey(_order.account, _order.pairIndex, _order.isLong);
        bytes32 orderKey = PositionKey.getOrderKey(_order.isIncrease, _order.tradeType, _order.orderId);

        uint256 index = positionOrderIndex[positionKey][orderKey];
        uint256 lastIndex = positionOrders[positionKey].length - 1;

        if (index < lastIndex) {
            // swap last order
            TradingTypes.PositionOrder memory lastOrder = positionOrders[positionKey][positionOrders[positionKey].length - 1];
            bytes32 lastOrderKey = PositionKey.getOrderKey(lastOrder.isIncrease, lastOrder.tradeType, lastOrder.orderId);

            positionOrders[positionKey][index] = lastOrder;
            positionOrderIndex[positionKey][lastOrderKey] = index;
        }
        delete positionOrderIndex[positionKey][orderKey];
        positionOrders[positionKey].pop();
        console.log("positionOrders remove orderId", _order.orderId, "tradeType", uint8(_order.tradeType));

        if (!_order.isIncrease && (_order.tradeType == TradingTypes.TradeType.MARKET || _order.tradeType == TradingTypes.TradeType.LIMIT)) {
            positionDecreaseTotalAmount[positionKey] -= _order.sizeAmount;
        }
    }

    function setIncreaseMarketOrderStartIndex(uint256 index) external onlyHandler {
        increaseMarketOrderStartIndex = index;
    }

    function setDecreaseMarketOrderStartIndex(uint256 index) external onlyHandler {
        decreaseMarketOrderStartIndex = index;
    }

    function setPositionHasTpSl(bytes32 key, TradingTypes.TradeType tradeType, bool has) external onlyHandler {
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

    function setOrderNeedADL(uint256 _orderId, TradingTypes.TradeType _tradeType, bool _needADL) external onlyHandler {
        TradingTypes.DecreasePositionOrder storage order;
        if (_tradeType == TradingTypes.TradeType.MARKET) {
            order = decreaseMarketOrders[_orderId];
        } else {
            order = decreaseLimitOrders[_orderId];
            require(order.tradeType == _tradeType, "trade type not match");
        }
        order.needADL = _needADL;
    }

    function saveIncreaseMarketOrder(TradingTypes.IncreasePositionOrder memory order) public {
        increaseMarketOrders[increaseMarketOrdersIndex++] = order;
    }

    function saveIncreaseLimitOrder(TradingTypes.IncreasePositionOrder memory order) public {
        increaseLimitOrders[increaseLimitOrdersIndex++] = order;
    }

    function saveDecreaseMarketOrder(TradingTypes.DecreasePositionOrder memory order) public {
        decreaseMarketOrders[decreaseMarketOrdersIndex++] = order;
    }

    function saveDecreaseLimitOrder(TradingTypes.DecreasePositionOrder memory order) public {
        decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;
    }

}
