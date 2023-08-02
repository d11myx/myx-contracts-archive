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
import "./interfaces/ITradingUtils.sol";
import "../interfaces/IPositionManager.sol";

contract PositionManager is IPositionManager {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingUtils public tradingUtils;
    ITradingRouter public tradingRouter;

    constructor(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingUtils _tradingUtils,
        ITradingRouter _tradingRouter
    ) {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingUtils = _tradingUtils;
        tradingRouter = _tradingRouter;
    }

    function createOrder(TradingTypes.CreateOrderRequest memory request) public returns (uint256 orderId) {
        //todo onlyRouterOrAccount
        address account = request.account;

        require(!tradingVault.isFrozen(account), "account is frozen");

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(request.pairIndex);

        // check size
        require(request.sizeAmount == 0 || checkTradingAmount(request.pairIndex, request.sizeAmount.abs()), "invalid trade size");

        uint256 price = tradingUtils.getPrice(request.pairIndex, request.isLong);
        bytes32 key = PositionKey.getPositionKey(account, request.pairIndex, request.isLong);

        // transfer collateral
        if (request.collateral > 0) {
            IERC20(pair.stableToken).safeTransferFrom(account, address(tradingRouter), request.collateral.abs());
        }

        if (request.sizeAmount > 0) {
            // check leverage
            (uint256 afterPosition,) = tradingUtils.validLeverage(account, request.pairIndex, request.isLong, request.collateral, uint256(request.sizeAmount), true);
            require(afterPosition > 0, "zero position amount");

            return _createIncreaseOrder(
                TradingTypes.IncreasePositionRequest({
                    account: account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.openPrice,
                    isLong: request.isLong,
                    sizeAmount: uint256(request.sizeAmount),
                    tpPrice: 0,
                    tp: 0,
                    slPrice: 0,
                    sl: 0
                })
            );
        } else if (request.sizeAmount < 0) {
            // check leverage
            (uint256 afterPosition,) = tradingUtils.validLeverage(account, request.pairIndex, request.isLong, request.collateral, uint256(request.sizeAmount.abs()), false);
            require(afterPosition > 0, "zero position amount");

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
            0,
            _request.account,
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
            order.orderId = tradingRouter.decreaseMarketOrdersIndex();
            tradingRouter.saveDecreaseMarketOrder(order);
            console.log("orderId", order.orderId, "decreaseMarketOrdersIndex", tradingRouter.decreaseMarketOrdersIndex());
        } else if (_request.tradeType == TradingTypes.TradeType.LIMIT) {
            order.orderId = tradingRouter.decreaseLimitOrdersIndex();
            tradingRouter.saveDecreaseLimitOrder(order);
            console.log("orderId", order.orderId, "decreaseLimitOrdersIndex", tradingRouter.decreaseLimitOrdersIndex());
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
}
