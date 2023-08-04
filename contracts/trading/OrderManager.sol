// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/IVaultPriceFeed.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/PositionKey.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/type/TradingTypes.sol";

import "../interfaces/ITradingVault.sol";
import "hardhat/console.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";

contract OrderManager is IOrderManager, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    mapping(uint256 => TradingTypes.IncreasePositionOrder) internal increaseMarketOrders;
    uint256 public override increaseMarketOrdersIndex;

    mapping(uint256 => TradingTypes.DecreasePositionOrder) internal decreaseMarketOrders;
    uint256 public override decreaseMarketOrdersIndex;

    mapping(uint256 => TradingTypes.IncreasePositionOrder) internal increaseLimitOrders;
    uint256 public  increaseLimitOrdersIndex;

    mapping(uint256 => TradingTypes.DecreasePositionOrder) internal decreaseLimitOrders;
    uint256 public  decreaseLimitOrdersIndex;

    mapping(bytes32 => PositionOrder[]) public positionOrders;
    mapping(bytes32 => mapping(bytes32 => uint256)) public positionOrderIndex;

    mapping(bytes32 => uint256) public positionDecreaseTotalAmount;

    mapping(bytes32 => mapping(TradingTypes.TradeType => bool)) public positionHasTpSl; // PositionKey -> TradeType -> bool


    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IVaultPriceFeed public vaultPriceFeed;

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IVaultPriceFeed _vaultPriceFeed
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        vaultPriceFeed = _vaultPriceFeed;
    }

    modifier onlyWhiteListOrSelf(address account) {
        require(
            IRoleManager(ADDRESS_PROVIDER.getRoleManager()).contractWhiteList(msg.sender) || account == msg.sender, "no access");
        _;
    }

    function getPositionOrders(bytes32 key) public view override returns (PositionOrder[] memory) {
        return positionOrders[key];
    }

    function createOrder(TradingTypes.CreateOrderRequest memory request) public nonReentrant onlyWhiteListOrSelf(request.account) returns (uint256 orderId) {
        address account = request.account;

        require(!tradingVault.isFrozen(account), "account is frozen");

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);
        require(pair.enable, "trade pair not supported");

        if (request.tradeType == TradingTypes.TradeType.MARKET || request.tradeType == TradingTypes.TradeType.LIMIT) {
            // check size
            require(request.sizeAmount == 0 || checkTradingAmount(request.pairIndex, request.sizeAmount.abs()), "invalid trade size");

            bytes32 positionKey = PositionKey.getPositionKey(account, request.pairIndex, request.isLong);
            Position.Info memory position = tradingVault.getPosition(account, request.pairIndex, request.isLong);
            uint256 price = vaultPriceFeed.getPrice(pair.indexToken);
            IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);
            //TODO if size = 0
            if (request.sizeAmount >= 0) {
                // check leverage
                (uint256 afterPosition,) = position.validLeverage(price, request.collateral, uint256(request.sizeAmount), true, tradingConfig.minLeverage, tradingConfig.maxLeverage, tradingConfig.maxPositionAmount);
                // (uint256 afterPosition,) = tradingUtils.validLeverage(account, request.pairIndex, request.isLong, request.collateral, uint256(request.sizeAmount), true);
                require(afterPosition > 0, "zero position amount");

                // check tp sl
                require(request.tp <= afterPosition && request.sl <= afterPosition, "tp/sl exceeds max size");
                require(request.tp == 0 || !positionHasTpSl[positionKey][TradingTypes.TradeType.TP], "tp already exists");
                require(request.sl == 0 || !positionHasTpSl[positionKey][TradingTypes.TradeType.SL], "sl already exists");
            }
            if (request.sizeAmount <= 0) {
                // check leverage
                position.validLeverage(price, request.collateral, uint256(request.sizeAmount.abs()), false, tradingConfig.minLeverage, tradingConfig.maxLeverage, tradingConfig.maxPositionAmount);

                //TODO if request size exceed position size, can calculate the max size
                require(uint256(request.sizeAmount.abs()) <= position.positionAmount - positionDecreaseTotalAmount[positionKey], "decrease amount exceed position");
            }

            // transfer collateral
            if (request.collateral > 0) {
                IERC20(pair.stableToken).safeTransferFrom(account, address(this), request.collateral.abs());
            }
        }

        if (request.tradeType == TradingTypes.TradeType.TP || request.tradeType == TradingTypes.TradeType.SL) {
            Position.Info memory position = tradingVault.getPosition(account, request.pairIndex, request.isLong);
            require(request.tp <= position.positionAmount && request.sl <= position.positionAmount, "tp/sl exceeds max size");
            require(request.collateral == 0, "no collateral required");
        }

        if (request.sizeAmount > 0) {
            return _createIncreaseOrder(
                TradingTypes.IncreasePositionRequest({
                    account: account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.openPrice,
                    isLong: request.isLong,
                    sizeAmount: uint256(request.sizeAmount),
                    tpPrice: request.tpPrice,
                    tp: request.tp,
                    slPrice: request.slPrice,
                    sl: request.sl
                })
            );
        } else if (request.sizeAmount < 0) {
            return _createDecreaseOrder(
                TradingTypes.DecreasePositionRequest({
                    account: account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    triggerPrice: request.openPrice,
                    sizeAmount: uint256(request.sizeAmount.abs()),
                    isLong: request.isLong
                })
            );
        } else {
            //todo
            revert('size eq 0');
        }
        return 0;
    }

    function cancelOrder(uint256 orderId, TradingTypes.TradeType tradeType, bool isIncrease) public nonReentrant {
        console.log("cancelIncreaseOrder orderId", orderId, "tradeType", uint8(tradeType));
        console.log("cancelIncreaseOrder orderId", orderId, "isIncrease", isIncrease);

        if (isIncrease) {
            TradingTypes.IncreasePositionOrder memory order = getIncreaseOrder(orderId, tradeType);
            if (order.account == address(0)) {
                return;
            }
            require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).contractWhiteList(msg.sender) || order.account == msg.sender, "no access");

            _cancelIncreaseOrder(order);
        } else {
            TradingTypes.DecreasePositionOrder memory order = getDecreaseOrder(orderId, tradeType);
            if (order.account == address(0)) {
                return;
            }
            require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).contractWhiteList(msg.sender) || order.account == msg.sender, "no access");

            _cancelDecreaseOrder(order);
        }
    }

    function checkTradingAmount(uint256 pairIndex, uint256 size) public returns (bool) {
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        return size >= tradingConfig.minTradeAmount && size <= tradingConfig.maxTradeAmount;
    }

    function _createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) internal returns (uint256) {
        TradingTypes.IncreasePositionOrder memory order = TradingTypes.IncreasePositionOrder(
            0,
            _request.account,
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
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = increaseLimitOrdersIndex;

            increaseLimitOrders[increaseLimitOrdersIndex++] = order;
            console.log("orderId", order.orderId, "increaseLimitOrdersIndex", increaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        this.addOrderToPosition(
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
            order.account,
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

    function _createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) internal returns (uint256) {
        TradingTypes.DecreasePositionOrder memory order = TradingTypes.DecreasePositionOrder(
            0, // orderId
            _request.account,
            _request.pairIndex,
            _request.tradeType,
            _request.collateral,
            _request.triggerPrice,
            _request.sizeAmount,
            _request.isLong,
            false, // abovePrice
            block.timestamp,
            false
        );

        // abovePrice
        // market：long: true,  short: false
        //  limit：long: false, short: true
        //     tp：long: false, short: true
        //     sl：long: true,  short: false
        if (_request.tradeType == TradingTypes.TradeType.MARKET) {
            order.orderId = decreaseMarketOrdersIndex;
            order.abovePrice = _request.isLong;

            decreaseMarketOrders[decreaseMarketOrdersIndex++] = order;
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = decreaseLimitOrdersIndex;
            order.abovePrice = !_request.isLong;

            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;
        } else if (_request.tradeType == TradingTypes.TradeType.TP) {
            order.orderId = decreaseLimitOrdersIndex;
            order.abovePrice = !_request.isLong;

            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;

            bytes32 positionKey = PositionKey.getPositionKey(_request.account, _request.pairIndex, _request.isLong);
            positionHasTpSl[positionKey][TradingTypes.TradeType.TP] = true;
        } else if (_request.tradeType == TradingTypes.TradeType.SL) {
            order.orderId = decreaseLimitOrdersIndex;
            order.abovePrice = _request.isLong;

            decreaseLimitOrders[decreaseLimitOrdersIndex++] = order;

            bytes32 positionKey = PositionKey.getPositionKey(_request.account, _request.pairIndex, _request.isLong);
            positionHasTpSl[positionKey][TradingTypes.TradeType.SL] = true;
        } else {
            revert("invalid trade type");
        }

        // add decrease order
        this.addOrderToPosition(
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
            order.account,
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

    function _cancelIncreaseOrder(TradingTypes.IncreasePositionOrder memory order) internal {
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        this.removeOrderFromPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            delete increaseMarketOrders[order.orderId];
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            delete increaseLimitOrders[order.orderId];
        }

        emit CancelIncreaseOrder(order.account, order.orderId, order.tradeType);
    }

    function _cancelDecreaseOrder(TradingTypes.DecreasePositionOrder memory order) internal {
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        if (order.collateral > 0) {
            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
        }

        this.removeOrderFromPosition(
            PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                false,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

        bytes32 key = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);

        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            delete decreaseMarketOrders[order.orderId];
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            delete decreaseLimitOrders[order.orderId];
        } else {
            positionHasTpSl[key][order.tradeType] = false;
            delete decreaseLimitOrders[order.orderId];
        }

        emit CancelDecreaseOrder(order.account, order.orderId, order.tradeType);
    }

    function getIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) public view returns (TradingTypes.IncreasePositionOrder memory order) {
        //TODO onlyManager
        if (tradeType == TradingTypes.TradeType.MARKET) {
            order = increaseMarketOrders[orderId];
        } else if (tradeType == TradingTypes.TradeType.LIMIT) {
            order = increaseLimitOrders[orderId];
        } else {
            revert("invalid trade type");
        }
        return order;
    }

    function getDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) public view returns (TradingTypes.DecreasePositionOrder memory order) {
        if (tradeType == TradingTypes.TradeType.MARKET) {
            order = decreaseMarketOrders[orderId];
        } else {
            order = decreaseLimitOrders[orderId];
        }
        return order;
    }

    function addOrderToPosition(PositionOrder memory order) public {
        //TODO onlyManager
        bytes32 positionKey = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);
        bytes32 orderKey = PositionKey.getOrderKey(order.isIncrease, order.tradeType, order.orderId);
        positionOrderIndex[positionKey][orderKey] = positionOrders[positionKey].length;
        positionOrders[positionKey].push(order);
        console.log("positionOrders add orderId", order.orderId, "tradeType", uint8(order.tradeType));

        if (!order.isIncrease && (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT)) {
            positionDecreaseTotalAmount[positionKey] += order.sizeAmount;
        }
    }

    function removeOrderFromPosition(PositionOrder memory order) public {
        //TODO onlyManager
        console.log("removeOrderFromPosition account %s orderId %s tradeType %s ", order.account, order.orderId, uint8(order.tradeType));
        bytes32 positionKey = PositionKey.getPositionKey(order.account, order.pairIndex, order.isLong);
        bytes32 orderKey = PositionKey.getOrderKey(order.isIncrease, order.tradeType, order.orderId);

        uint256 index = positionOrderIndex[positionKey][orderKey];
        uint256 lastIndex = positionOrders[positionKey].length - 1;

        if (index < lastIndex) {
            // swap last order
            PositionOrder memory lastOrder = positionOrders[positionKey][positionOrders[positionKey].length - 1];
            bytes32 lastOrderKey = PositionKey.getOrderKey(lastOrder.isIncrease, lastOrder.tradeType, lastOrder.orderId);

            positionOrders[positionKey][index] = lastOrder;
            positionOrderIndex[positionKey][lastOrderKey] = index;
        }
        delete positionOrderIndex[positionKey][orderKey];
        positionOrders[positionKey].pop();
        console.log("positionOrders remove orderId", order.orderId, "tradeType", uint8(order.tradeType));

        if (!order.isIncrease && (order.tradeType == TradingTypes.TradeType.MARKET || order.tradeType == TradingTypes.TradeType.LIMIT)) {
            positionDecreaseTotalAmount[positionKey] -= order.sizeAmount;
        }
    }

    function setPositionHasTpSl(bytes32 key, TradingTypes.TradeType tradeType, bool has) public {
        positionHasTpSl[key][tradeType] = has;
    }

    ////TODO onlyManager
    function removeIncreaseMarketOrders(uint256 orderId) public {
        delete increaseMarketOrders[orderId];
    }

    function removeIncreaseLimitOrders(uint256 orderId) public {
        delete increaseLimitOrders[orderId];
    }

    function removeDecreaseMarketOrders(uint256 orderId) public {
        delete decreaseMarketOrders[orderId];
    }

    function removeDecreaseLimitOrders(uint256 orderId) public {
        delete decreaseLimitOrders[orderId];
    }

    function setOrderNeedADL(uint256 orderId, TradingTypes.TradeType tradeType, bool needADL) public {
        TradingTypes.DecreasePositionOrder storage order;
        if (tradeType == TradingTypes.TradeType.MARKET) {
            order = decreaseMarketOrders[orderId];
        } else {
            order = decreaseLimitOrders[orderId];
            require(order.tradeType == tradeType, "trade type not match");
        }
        order.needADL = needADL;
    }
}
