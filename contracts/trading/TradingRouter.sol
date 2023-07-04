// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITradingRouter.sol";
import "../pair/interfaces/IPairInfo.sol";
import "./interfaces/ITradingVault.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../libraries/PriceUtils.sol";
import "../libraries/access/Handleable.sol";
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
        TradeType tradeType;
        uint256 pairIndex;
        uint256 openPrice;             // 限价触发价格
        uint256 sizeAmount;            // 关单数量
        bool isLong;
        bool abovePrice;               // 高于或低于触发价格（止盈止损）
    }

    struct IncreasePositionOrder {
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
        address account;
        TradeType tradeType;
        uint256 pairIndex;
        uint256 openPrice;             // 限价触发价格
        uint256 sizeAmount;            // 关单数量
        bool isLong;
        bool abovePrice;               // 高于或低于触发价格（止盈止损）
        uint256 blockTime;
    }

    // 市价开仓
    event CreateIncreaseOrder(
        address account,
        uint256 orderId,
        uint256 pairIndex,
        TradeType tradeType,
        uint256 collateral,
        bool long,
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
        TradeType tradeType,
        bool isLong,
        uint256 sizeAmount,
        uint256 price
    );
    event CancelOrder(address account, uint256 orderId, TradeType tradeType);

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IVaultPriceFeed public vaultPriceFeed;

    address public tradingFeeReceiver;
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

    mapping (address => bool) public isPositionKeeper;

    modifier onlyPositionKeeper() {
        require(isPositionKeeper[msg.sender], "only position keeper");
        _;
    }

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        IVaultPriceFeed _vaultPriceFeed,
        address _tradingFeeReceiver
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        vaultPriceFeed = _vaultPriceFeed;
        tradingFeeReceiver = _tradingFeeReceiver;
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

    function setTradingFeeReceiver(address _tradingFeeReceiver) external onlyGov {
        tradingFeeReceiver = _tradingFeeReceiver;
    }

    function createIncreaseOrder(IncreasePositionRequest memory request) external nonReentrant returns(uint256 orderId) {
        address account = msg.sender;

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);

        require(!tradingVault.isFrozen(account), "account is frozen");
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(request.pairIndex);
        uint256 price = _getPrice(pair.indexToken, request.isLong);

        require(request.sizeAmount >= request.collateral.getAmountByPrice(price) * tradingConfig.minLeverage
            && request.sizeAmount <= request.collateral.getAmountByPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");

        require(request.collateral > 0, "invalid collateral");
        require(request.tp <= request.sizeAmount && request.sl <= request.sizeAmount, "tp/sl exceeds max size");
        require(request.sizeAmount >= tradingConfig.minOpenAmount && request.sizeAmount <= tradingConfig.maxOpenAmount, "invalid size");

        IERC20(pair.stableToken).safeTransferFrom(account, address(this), request.collateral);

        IncreasePositionOrder memory order = IncreasePositionOrder(
            account,
            request.pairIndex,
            request.tradeType,
            request.collateral,
            request.openPrice,
            request.isLong,
            request.sizeAmount,
            request.tpPrice,
            request.tp,
            request.slPrice,
            request.sl,
            block.timestamp
        );

        if (request.tradeType == TradeType.MARKET) {
            require(request.tpPrice == 0 ||
                (request.isLong ?
                request.tpPrice > request.openPrice.max(price) :
                request.tpPrice < request.openPrice.min(price)),
                "wrong tp price");
            require(request.slPrice == 0 ||
                (request.isLong ?
                request.slPrice < request.openPrice.min(price) :
                request.slPrice > request.openPrice.max(price)),
                "wrong sl price");

            increaseMarketOrders[increaseMarketOrdersIndex] = order;
            orderId = increaseMarketOrdersIndex;
            increaseMarketOrdersIndex = increaseMarketOrdersIndex + 1;
            console.log("orderId", orderId, "increaseMarketOrdersIndex", increaseMarketOrdersIndex);
        } else if (request.tradeType == TradeType.LIMIT) {
            require(request.tpPrice == 0 ||
                (request.isLong ?
                request.tpPrice > request.openPrice :
                request.tpPrice < request.openPrice),
                "wrong tp price");
            require(request.slPrice == 0 ||
                (request.isLong ?
                request.slPrice <
                request.openPrice :
                request.slPrice >
                request.openPrice),
                "wrong sl price");

            increaseLimitOrders[increaseLimitOrdersIndex] = order;
            orderId = increaseLimitOrdersIndex;
            increaseLimitOrdersIndex = increaseLimitOrdersIndex + 1;
            console.log("orderId", orderId, "increaseLimitOrdersIndex", increaseLimitOrdersIndex);
        } else {
            revert("invalid trade type");
        }

        emit CreateIncreaseOrder(
            account,
            orderId,
            request.pairIndex,
            request.tradeType,
            request.collateral,
            request.isLong,
            request.sizeAmount,
            request.tpPrice,
            request.tp,
            request.slPrice,
            request.sl
        );
        return orderId;
    }

    function executeIncreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = increaseMarketOrderStartIndex;
        uint256 length = increaseMarketOrdersIndex;
        if (index >= length) {
            return;
        }
        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            try this.executeIncreaseOrder(index, TradeType.MARKET) {

            } catch {
                this.cancelIncreaseOrder(index, TradeType.MARKET);
            }
            delete increaseMarketOrders[index];
            index++;
        }
        increaseMarketOrdersIndex = index;
    }

    function executeIncreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        IncreasePositionOrder memory order = _getIncreaseOrder(_orderId, _tradeType);

        // 请求已执行或已取消
        if (order.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _orderId);
            return;
        }

        // expire
        require(order.blockTime + maxTimeDelay <= block.timestamp, "order expired");

        uint256 pairIndex = order.pairIndex;

        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        require(pair.enable, "trade pair not supported");

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);
        uint256 price = _getPrice(pair.indexToken, order.isLong);

        require(order.sizeAmount >= order.collateral.getAmountByPrice(price) * tradingConfig.minLeverage
            && order.sizeAmount <= order.collateral.getAmountByPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");
        require(!tradingVault.isFrozen(order.account), "account is frozen");

        // check price
        if (order.tradeType == TradeType.MARKET) {
            require(order.isLong ? price <= order.openPrice : price >= order.openPrice, "exceed acceptable price");
        } else {
            require(order.isLong ? price >= order.openPrice : price <= order.openPrice, "not reach trigger price");
        }

        // trading fee
        IPairInfo.FeePercentage memory feeP = pairInfo.getFeePercentage(pairIndex);
        uint256 tradingFee;
        if (tradingVault.netExposureAmountChecker(pairIndex) >= 0) {
            // 偏向多头
            if (order.isLong) {
                // fee
                tradingFee = order.collateral.mulPercentage(feeP.takerFeeP);
            } else {
                tradingFee = order.collateral.mulPercentage(feeP.makerFeeP);
            }
        } else {
            // 偏向空头
            if (order.isLong) {
                tradingFee = order.collateral.mulPercentage(feeP.makerFeeP);
            } else {
                tradingFee = order.collateral.mulPercentage(feeP.takerFeeP);
            }
        }

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        uint256 afterFeeCollateral = order.collateral - tradingFee;
        IERC20(pair.stableToken).safeTransfer(address(tradingVault), afterFeeCollateral);

        // trading vault
        tradingVault.increasePosition(order.account, pairIndex, afterFeeCollateral, order.sizeAmount, order.isLong);

        // 添加止盈止损
        if (order.tp > 0) {
            DecreasePositionOrder memory tpOrder = DecreasePositionOrder(
                order.account,
                TradeType.TP,
                pairIndex,
                order.tpPrice,
                order.tp,
                order.isLong,
                order.isLong ? true : false,
                block.timestamp
            );
            decreaseLimitOrders[decreaseLimitOrdersIndex] = tpOrder;
            decreaseLimitOrdersIndex = decreaseLimitOrdersIndex + 1;
            emit CreateDecreaseOrder(
                order.account,
                _orderId,
                TradeType.TP,
                pairIndex,
                order.tpPrice,
                order.tp,
                order.isLong,
                order.isLong ? true : false
            );
        }
        if (order.sl > 0) {
            DecreasePositionOrder memory slOrder = DecreasePositionOrder(
                order.account,
                TradeType.SL,
                pairIndex,
                order.slPrice,
                order.sl,
                order.isLong,
                order.isLong ? false : true,
                block.timestamp
            );
            decreaseLimitOrders[decreaseLimitOrdersIndex] = slOrder;
            decreaseLimitOrdersIndex = decreaseLimitOrdersIndex + 1;
            emit CreateDecreaseOrder(
                order.account,
                _orderId,
                TradeType.SL,
                pairIndex,
                order.slPrice,
                order.sl,
                order.isLong,
                order.isLong ? false : true
            );
        }
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
            afterFeeCollateral,
            order.isLong,
            order.sizeAmount,
            price
        );
    }

    function cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType) public nonReentrant {
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
            delete increaseMarketOrders[_orderId];
        }

        emit CancelOrder(order.account, _orderId, _tradeType);
    }

    function _getIncreaseOrder(uint256 _orderId, TradeType tradeType) internal returns(IncreasePositionOrder memory order) {
        if (tradeType == TradeType.MARKET) {
            order = increaseMarketOrders[_orderId];
        } else if (tradeType == TradeType.LIMIT) {
            order = increaseLimitOrders[_orderId];
        } else {
            revert("invalid trade type");
        }
        return order;
    }

    function updateTpSl() public {

    }

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
