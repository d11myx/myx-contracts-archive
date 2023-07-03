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
    using PriceUtils for uint256;

    enum TradeType {MARKET, LIMIT, TP, SL}

    struct IncreasePositionRequest {
        address account;
        uint256 pairIndex;             // 币对index
        TradeType tradeType;           // 0: MARKET, 1: LIMIT
        uint256 collateral;            // 1e18 保证金数量
        uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
        bool isLong;                   // 多/空
        uint256 sizeDelta;             // 仓位价值
        uint256 tpPrice;               // 止盈价 1e30
        uint256 tp;                    // 止盈数量
        uint256 slPrice;               // 止损价 1e30
        uint256 sl;                    // 止损数量
    }

    struct DecreasePositionRequest {
        address account;
        TradeType tradeType;
        uint256 pairIndex;
        uint256 openPrice;
        uint256 sizeDelta;
        bool isLong;
        bool abovePrice;
    }

    // 市价开档
    event IncreaseMarket(
        address account,
        uint256 requestIndex,
        uint256 pairIndex,
        uint256 collateral,
        bool long,
        uint256 sizeDelta,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
    );

    event DecreaseMarket(
        address account,
        TradeType tradeType,
        uint256 pairIndex,
        uint256 openPrice,
        uint256 sizeDelta,
        bool isLong,
        bool abovePrice
    );

    // 限价开单
    event IncreaseLimit(
        address account,
        uint256 requestIndex,
        uint256 pairIndex,
        uint256 collateral,
        uint256 openPrice,
        bool long,
        uint256 sizeDelta,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
    );

    event DecreaseLimit(
        address account,
        uint256 requestIndex,
        TradeType tradeType,
        uint256 pairIndex,
        uint256 openPrice,
        uint256 sizeDelta,
        bool isLong,
        bool abovePrice
    );

    event ExecuteOrder(uint256 requestId, TradeType tradeType);
    event CancelOrder(uint256 requestId, TradeType tradeType);

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IVaultPriceFeed public vaultPriceFeed;

    address public tradingFeeReceiver;

    // 市价请求
    mapping(uint256 => IncreasePositionRequest) public increaseMarketRequests;
    mapping(uint256 => DecreasePositionRequest) public decreaseMarketRequests;
    // 当前市价开仓请求最后index
    uint256 public increaseMarketRequestsIndex;
    uint256 public decreaseMarketRequestsIndex;
    // 当前市价开仓请求未执行订单起始index
    uint256 public increaseMarketRequestStartIndex;
    uint256 public decreaseMarketRequestStartIndex;

    // 限价请求
    mapping(uint256 => IncreasePositionRequest) public increaseLimitRequests;
    mapping(uint256 => DecreasePositionRequest) public decreaseLimitRequests;
    uint256 public increaseLimitRequestsIndex;
    uint256 public decreaseLimitRequestsIndex;

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

    function createIncreaseOrder(IncreasePositionRequest memory request) external nonReentrant returns(uint256 requestIndex) {
        address account = msg.sender;
        request.account = account;

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);

        require(!tradingVault.isFrozen(account), "account is frozen");
        require(pair.enable, "trade pair not supported");
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(request.pairIndex);
        require(request.sizeDelta >= request.collateral * tradingConfig.minLeverage
            && request.sizeDelta <= request.collateral * tradingConfig.maxLeverage, "leverage incorrect");

        require(request.collateral > 0, "invalid collateral");
        require(request.tp <= request.sizeDelta && request.sl <= request.sizeDelta, "tp/sl exceeds max size");
        require(request.sizeDelta >= tradingConfig.minSize && request.sizeDelta <= tradingConfig.maxSize, "invalid size");

        IERC20(pair.stableToken).safeTransferFrom(account, address(this), request.collateral);

        if (request.tradeType == TradeType.MARKET) {
            uint256 price = _getPrice(pair.indexToken, request.isLong);

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

            increaseMarketRequests[increaseMarketRequestsIndex] = request;
            requestIndex = increaseMarketRequestsIndex;
            increaseMarketRequestsIndex = increaseMarketRequestsIndex + 1;
            console.log("requestIndex", requestIndex, "increaseMarketRequestsIndex", increaseMarketRequestsIndex);

            emit IncreaseMarket(
                account,
                requestIndex,
                request.pairIndex,
                request.collateral,
                request.isLong,
                request.sizeDelta,
                request.tpPrice,
                request.tp,
                request.slPrice,
                request.sl
            );
            return requestIndex;
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

            increaseLimitRequests[increaseLimitRequestsIndex] = request;
            requestIndex = increaseLimitRequestsIndex;
            increaseLimitRequestsIndex = increaseLimitRequestsIndex + 1;
            console.log("requestIndex", requestIndex, "increaseLimitRequestsIndex", increaseLimitRequestsIndex);

            emit IncreaseLimit(
                account,
                requestIndex,
                request.pairIndex,
                request.collateral,
                request.openPrice,
                request.isLong,
                request.sizeDelta,
                request.tpPrice,
                request.tp,
                request.slPrice,
                request.sl
            );
            return requestIndex;
        } else {
            revert("invalid trade type");
        }
    }

    function executeIncreaseMarketOrders(uint256 _endIndex) external onlyPositionKeeper {
        uint256 index = increaseMarketRequestStartIndex;
        uint256 length = increaseMarketRequestsIndex;
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
            delete increaseMarketRequests[index];
            index++;
        }
        increaseMarketRequestsIndex = index;
    }

    function executeIncreaseOrder(uint256 _requestIndex, TradeType _tradeType) public nonReentrant onlyPositionKeeper {
        IncreasePositionRequest memory request = _getIncreaseRequest(_requestIndex, _tradeType);

        // 请求已执行或已取消
        if (request.account == address(0)) {
            console.log("executeIncreaseOrder not exists", _requestIndex);
            return;
        }

        uint256 pairIndex = request.pairIndex;

        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(pairIndex);

        require(pair.enable, "trade pair not supported");
        require(request.sizeDelta >= request.collateral * tradingConfig.minLeverage
            && request.sizeDelta <= request.collateral * tradingConfig.maxLeverage, "leverage incorrect");

        require(!tradingVault.isFrozen(request.account), "account is frozen");

        uint256 price = _getPrice(pair.indexToken, request.isLong);

        // check price
        if (request.tradeType == TradeType.MARKET) {
            require(request.isLong ? price <= request.openPrice : price >= request.openPrice, "exceed acceptable price");
        } else {
            require(request.isLong ? price >= request.openPrice : price <= request.openPrice, "not reach trigger price");
        }

        // trading fee
        IPairInfo.FeePercentage memory feeP = pairInfo.getFeePercentage(pairIndex);
        uint256 tradingFee;
        if (tradingVault.netExposureAmountChecker(pairIndex) >= 0) {
            // 偏向多头
            if (request.isLong) {
                // fee
                tradingFee = request.collateral.mulPercentage(feeP.takerFeeP);
            } else {
                tradingFee = request.collateral.mulPercentage(feeP.makerFeeP);
            }
        } else {
            // 偏向空头
            if (request.isLong) {
                tradingFee = request.collateral.mulPercentage(feeP.makerFeeP);
            } else {
                tradingFee = request.collateral.mulPercentage(feeP.takerFeeP);
            }
        }

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        uint256 afterFeeCollateral = request.collateral - tradingFee;
        IERC20(pair.stableToken).safeTransfer(address(tradingVault), afterFeeCollateral);

        // trading vault
        tradingVault.increasePosition(request.account, pairIndex, afterFeeCollateral, request.sizeDelta, request.isLong);

        // 添加止盈止损
        if (request.tp > 0) {
            DecreasePositionRequest memory tpRequest = DecreasePositionRequest(
                request.account,
                TradeType.TP,
                pairIndex,
                request.tpPrice,
                request.tp,
                request.isLong,
                request.isLong ? true : false
            );
            decreaseLimitRequests[decreaseLimitRequestsIndex] = tpRequest;
            decreaseLimitRequestsIndex = decreaseLimitRequestsIndex + 1;
            emit DecreaseLimit(
                request.account,
                _requestIndex,
                TradeType.TP,
                pairIndex,
                request.tpPrice,
                request.tp,
                request.isLong,
                request.isLong ? true : false
            );
        }
        if (request.sl > 0) {
            DecreasePositionRequest memory slRequest = DecreasePositionRequest(
                request.account,
                TradeType.SL,
                pairIndex,
                request.slPrice,
                request.sl,
                request.isLong,
                request.isLong ? false : true
            );
            decreaseLimitRequests[decreaseLimitRequestsIndex] = slRequest;
            decreaseLimitRequestsIndex = decreaseLimitRequestsIndex + 1;
            emit DecreaseLimit(
                request.account,
                _requestIndex,
                TradeType.SL,
                pairIndex,
                request.slPrice,
                request.sl,
                request.isLong,
                request.isLong ? false : true
            );
        }
        if (_tradeType == TradeType.MARKET) {
            delete increaseMarketRequests[_requestIndex];
        } else if (_tradeType == TradeType.LIMIT) {
            delete increaseLimitRequests[_requestIndex];
        }

        emit ExecuteOrder(_requestIndex, _tradeType);
    }

    function cancelIncreaseOrder(uint256 _requestIndex, TradeType _tradeType) public nonReentrant {
        IncreasePositionRequest memory request = _getIncreaseRequest(_requestIndex, _tradeType);

        if (request.account == address(0)) {
            return;
        }
        require(msg.sender == address(this) || msg.sender == request.account, "not request sender");

        IPairInfo.Pair memory pair = pairInfo.getPair(request.pairIndex);

        IERC20(pair.stableToken).safeTransfer(request.account, request.collateral);

        if (_tradeType == TradeType.MARKET) {
            delete increaseMarketRequests[_requestIndex];
        } else if (_tradeType == TradeType.LIMIT) {
            delete increaseMarketRequests[_requestIndex];
        }

        emit CancelOrder(_requestIndex, _tradeType);
    }

    function _getIncreaseRequest(uint256 _requestIndex, TradeType tradeType) internal returns(IncreasePositionRequest memory request) {
        if (tradeType == TradeType.MARKET) {
            request = increaseMarketRequests[_requestIndex];
        } else if (tradeType == TradeType.LIMIT) {
            request = increaseLimitRequests[_requestIndex];
        } else {
            revert("invalid trade type");
        }
        return request;
    }

    function updateTpSl() public {

    }

    // 市价开仓
    function _storeIncreaseMarketRequest() internal {

    }

    // 市价减仓
    function _storeDecreaseMarketRequest() internal {

    }

    // 限价开仓
    function _storeIncreaseLimitRequest() internal {

    }

    // 限价减仓
    function _storeDecreaseLimitRequest() internal {

    }

    // 止盈止损
    function _storeTpSlRequest() internal {

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

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
