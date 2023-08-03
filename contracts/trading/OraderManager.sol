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

import "./interfaces/ITradingRouter.sol";
import "./interfaces/ITradingVault.sol";
import "hardhat/console.sol";
import "../interfaces/IPositionManager.sol";

contract OrderManager is IPositionManager {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;


    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IVaultPriceFeed public vaultPriceFeed;

    constructor(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IVaultPriceFeed _vaultPriceFeed
    ) {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function createOrder(TradingTypes.CreateOrderRequest memory request) public returns (uint256 orderId) {
        //todo onlyRouterOrAccount
        address account = request.account;

        require(!tradingVault.isFrozen(account), "account is frozen");

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);
        require(pair.enable, "trade pair not supported");

        if (request.tradeType == TradingTypes.TradeType.MARKET || request.tradeType == TradingTypes.TradeType.LIMIT) {
            // check size
            require(request.sizeAmount == 0 || checkTradingAmount(request.pairIndex, request.sizeAmount.abs()), "invalid trade size");

            bytes32 positionKey = PositionKey.getPositionKey(account, request.pairIndex, request.isLong);
            Position.Info memory position = tradingVault.getPosition(account, request.pairIndex, request.isLong);
            uint256 price =vaultPriceFeed.getPrice(pair.indexToken);
            IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);
            //TODO if size = 0
            if (request.sizeAmount >= 0) {
                // check leverage
                (uint256 afterPosition,) = position.validLeverage(price,request.collateral, uint256(request.sizeAmount), true,tradingConfig.minLeverage,tradingConfig.maxLeverage,tradingConfig.maxPositionAmount);
                // (uint256 afterPosition,) = tradingUtils.validLeverage(account, request.pairIndex, request.isLong, request.collateral, uint256(request.sizeAmount), true);
                require(afterPosition > 0, "zero position amount");

                // check tp sl
                require(request.tp <= afterPosition && request.sl <= afterPosition, "tp/sl exceeds max size");
                require(request.tp == 0 || !tradingRouter.positionHasTpSl(positionKey, TradingTypes.TradeType.TP), "tp already exists");
                require(request.sl == 0 || !tradingRouter.positionHasTpSl(positionKey, TradingTypes.TradeType.SL), "sl already exists");
            }
            if (request.sizeAmount <= 0) {
                // check leverage
                position.validLeverage(price, request.collateral, uint256(request.sizeAmount.abs()), false,tradingConfig.minLeverage,tradingConfig.maxLeverage,tradingConfig.maxPositionAmount);



                //TODO if request size exceed position size, can calculate the max size
                require(uint256(request.sizeAmount.abs()) <= position.positionAmount - tradingRouter.positionDecreaseTotalAmount(positionKey), "decrease amount exceed position");
            }

            // transfer collateral
            if (request.collateral > 0) {
                IERC20(pair.stableToken).safeTransferFrom(account, address(tradingRouter), request.collateral.abs());
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

    function cancelOrder(uint256 orderId, TradingTypes.TradeType tradeType, bool isIncrease) public {
        console.log("cancelIncreaseOrder orderId", orderId, "tradeType", uint8(tradeType));
        console.log("cancelIncreaseOrder orderId", orderId, "isIncrease", isIncrease);

        if (isIncrease) {
            TradingTypes.IncreasePositionOrder memory order = tradingRouter.getIncreaseOrder(orderId, tradeType);
            if (order.account == address(0)) {
                return;
            }
            //TODO onlyRouterOrOrderOwner
//            require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

            _cancelIncreaseOrder(order);
        } else {
            TradingTypes.DecreasePositionOrder memory order = tradingRouter.getDecreaseOrder(orderId, tradeType);
            if (order.account == address(0)) {
                return;
            }
            //TODO onlyRouterOrOrderOwner
//            require(msg.sender == address(this) || isHandler[msg.sender] || msg.sender == order.account, "not order sender or handler");

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
            order.orderId = tradingRouter.increaseMarketOrdersIndex();
            tradingRouter.saveIncreaseMarketOrder(order);
            console.log("orderId", order.orderId, "increaseMarketOrdersIndex", tradingRouter.increaseMarketOrdersIndex());
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = tradingRouter.increaseLimitOrdersIndex();
            tradingRouter.saveIncreaseLimitOrder(order);
            console.log("orderId", order.orderId, "increaseLimitOrdersIndex", tradingRouter.increaseLimitOrdersIndex());
        } else {
            revert("invalid trade type");
        }

        tradingRouter.addOrderToPosition(
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
            order.orderId = tradingRouter.decreaseMarketOrdersIndex();
            order.abovePrice = _request.isLong;

            tradingRouter.saveDecreaseMarketOrder(order);
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = tradingRouter.decreaseLimitOrdersIndex();
            order.abovePrice = !_request.isLong;

            tradingRouter.saveDecreaseLimitOrder(order);
        } else if (_request.tradeType == TradingTypes.TradeType.TP) {
            order.orderId = tradingRouter.decreaseLimitOrdersIndex();
            order.abovePrice = !_request.isLong;

            tradingRouter.saveDecreaseLimitOrder(order);
            tradingRouter.setPositionHasTpSl(
                PositionKey.getPositionKey(_request.account, _request.pairIndex, _request.isLong), TradingTypes.TradeType.TP, true);
        } else if (_request.tradeType == TradingTypes.TradeType.SL) {
            order.orderId = tradingRouter.decreaseLimitOrdersIndex();
            order.abovePrice = _request.isLong;

            tradingRouter.saveDecreaseLimitOrder(order);
            tradingRouter.setPositionHasTpSl(
                PositionKey.getPositionKey(_request.account, _request.pairIndex, _request.isLong), TradingTypes.TradeType.SL, true);
        } else {
            revert("invalid trade type");
        }

        // add decrease order
        tradingRouter.addOrderToPosition(
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
            //TODO if removed TradingRouter, fix this
//            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
            IERC20(pair.stableToken).safeTransferFrom(address(tradingRouter), order.account, order.collateral.abs());
        }

        tradingRouter.removeOrderFromPosition(
            TradingTypes.PositionOrder(
                order.account,
                order.pairIndex,
                order.isLong,
                true,
                order.tradeType,
                order.orderId,
                order.sizeAmount
            ));

        if (order.tradeType == TradingTypes.TradeType.MARKET) {
            tradingRouter.removeFromIncreaseMarketOrders(order.orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            tradingRouter.removeFromIncreaseLimitOrders(order.orderId);
        }

        emit CancelIncreaseOrder(order.account, order.orderId, order.tradeType);
    }

    function _cancelDecreaseOrder(TradingTypes.DecreasePositionOrder memory order) internal {
        IPairInfo.Pair memory pair = pairInfo.getPair(order.pairIndex);

        if (order.collateral > 0) {
            //TODO if removed TradingRouter, fix this
//            IERC20(pair.stableToken).safeTransfer(order.account, order.collateral.abs());
            IERC20(pair.stableToken).safeTransferFrom(address(tradingRouter), order.account, order.collateral.abs());
        }

        tradingRouter.removeOrderFromPosition(
            TradingTypes.PositionOrder(
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
            tradingRouter.removeFromDecreaseMarketOrders(order.orderId);
        } else if (order.tradeType == TradingTypes.TradeType.LIMIT) {
            tradingRouter.removeFromDecreaseLimitOrders(order.orderId);
        } else {
            tradingRouter.setPositionHasTpSl(key, order.tradeType, false);
            tradingRouter.removeFromDecreaseLimitOrders(order.orderId);
        }

        emit CancelDecreaseOrder(order.account, order.orderId, order.tradeType);
    }
}
