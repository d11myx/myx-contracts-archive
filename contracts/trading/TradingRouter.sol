// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingRouter.sol";
import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITradingVault.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../price/interfaces/IVaultPriceFeed.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable {

    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;

    enum TradeType {MARKET, LIMIT, TP, SL}

    struct IncreasePositionRequest {
        address account;
        TradeType tradeType;
        uint256 pairIndex;
        uint256 collateral;
        uint256 openPrice;
        bool isLong;
        uint256 positionDelta;
        uint256 tpPrice;
        uint256 tp;
        uint256 slPrice;
        uint256 sl;
    }

    struct DecreasePositionRequest {
        address account;
        TradeType tradeType;
        uint256 pairIndex;
        uint256 collateral;
        uint256 openPrice;
        bool isLong;
        uint256 positionDelta;
    }

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    IVaultPriceFeed public vaultPriceFeed;

    mapping(uint256 => IncreasePositionRequest) public increaseMarketRequests;
    mapping(uint256 => DecreasePositionRequest) public decreaseMarketRequests;
    uint256 public increaseMarketRequestsIndex;
    uint256 public decreaseMarketRequestsIndex;
    uint256 public increaseMarketRequestStartIndex;
    uint256 public decreaseMarketRequestStartIndex;

    mapping(uint256 => IncreasePositionRequest) public increaseLimitRequests;
    mapping(uint256 => DecreasePositionRequest) public decreaseLimitRequests;
    uint256 public increaseLimitRequestsIndex;
    uint256 public decreaseLimitRequestsIndex;

    event IncreaseMarket(
        address account,
        uint256 requestIndex,
        uint256 pairIndex,
        uint256 collateral,
        bool long,
        uint256 positionSize,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
    );

    event DecreaseMarket(

    );

    event IncreaseLimit(
        address account,
        uint256 requestIndex,
        uint256 pairIndex,
        uint256 collateral,
        uint256 openPrice,
        bool long,
        uint256 positionSize,
        uint256 tpPrice,
        uint256 tpAmount,
        uint256 slPrice,
        uint256 slAmount
    );

    event DecreaseLimit();


    function createIncreasePosition(
        TradeType tradeType,           // 0: MARKET, 1: LIMIT
        uint256 pairIndex,             // 币对index
        uint256 collateral,            // 1e18 保证金数量
        uint256 openPrice,             // 1e30 市价可接受价格/限价开仓价格
        bool isLong,                   // 多/空
        uint leverage,                 // 杠杆
        uint256 tpPrice,               // 止盈价 1e30
        uint256 tp,                    // 止盈数量
        uint256 slPrice,               // 止损价 1e30
        uint256 sl                     // 止损数量
    ) external nonReentrant returns(uint256 requestIndex) {
        address account = msg.sender;

        IPairInfo.Pair pair = pairInfo.getPair(pairIndex);

        require(tradingVault.isFrozen(request.account), "account is frozen");
        require(pair.enable, "trade pair not supported");
        require(leverage >= pair.minLeverage && leverage <= pair.maxLeverage, "leverage incorrect");

        require(collateral > 0, "invalid collateral");
        uint256 positionDelta = collateral * leverage;
        require(tp <= positionDelta && sl <= positionDelta, "tp/sl exceeds max size");
        require(positionDelta >= pair.minSize && positionDelta <= pair.maxSize, "invalid size");

        IERC20(pair.stableToken).safeTransferFrom(account, address(this), collateral);

        if (tradeType == TradeType.MARKET) {
            IncreasePositionRequest memory request = IncreasePositionRequest(
                account,
                pairIndex,
                collateral,
                openPrice,
                isLong,
                positionDelta,
                tpPrice,
                tp,
                slPrice,
                sl
            );
            increaseMarketRequests[increaseMarketRequestsIndex] = request;
            requestIndex = increaseMarketRequestsIndex;
            increaseMarketRequestsIndex = increaseMarketRequestsIndex + 1;

            emit IncreaseMarket(
                account,
                requestIndex,
                pairIndex,
                collateral,
                isLong,
                positionDelta,
                tpPrice,
                tp,
                slPrice,
                sl
            );
            return requestIndex;
        } else {
            require(tpPrice == 0 || (isLong ? tpPrice > openPrice : tpPrice < openPrice), "wrong tp price");
            require(slPrice == 0 || (isLong ? slPrice < openPrice : slPrice > openPrice), "wrong sl price");
            IncreasePositionRequest memory request = IncreasePositionRequest(
                account,
                pairIndex,
                collateral,
                openPrice,
                isLong,
                positionDelta,
                tpPrice,
                tp,
                slPrice,
                sl
            );
            increaseLimitRequests[increaseLimitRequestsIndex] = request;
            requestIndex = increaseLimitRequestsIndex;
            increaseLimitRequestsIndex = increaseLimitRequestsIndex + 1;

            emit IncreaseLimitRequest(
                account,
                requestIndex,
                pairIndex,
                collateral,
                openPrice,
                isLong,
                positionDelta,
                tpPrice,
                tp,
                slPrice,
                sl
            );
            return requestIndex;
        }
    }

    function executeIncreasePosition(uint256 requestIndex) {
        IncreasePositionRequest memory request = increaseMarketRequests[requestIndex];
        uint256 pairIndex = request.pairIndex;
        IPairInfo.Pair pair = pairInfo.getPair(pairIndex);

        require(pair.enable, "trade pair not supported");
        require(leverage >= pair.minLeverage && leverage <= pair.maxLeverage, "leverage incorrect");

        require(tradingVault.isFrozen(request.account), "account is frozen");

        IPairVault.Vault lpVault = pairVault.getVault(pairIndex);

        uint256 price = getPrice(pairIndex);

        // check price
        if (request.tradeType == TradeType.MARKET) {
            require(request.isLong ? price <= request.openPrice : price >= request.openPrice, "exceed acceptable price");
        } else {
            require(request.isLong ? price >= request.openPrice : price <= request.openPrice, "not reach trigger price");
        }

        // trading fee
        IPairInfo.Fee fee = pair.fee;
        uint256 tradingFee;
        if (tradingVault.netExposureAmountChecker() >= 0) {
            // 偏向多头
            if (request.isLong) {
                // fee
                tradingFee = request.positionDelta.mulPercentage(fee.takerFeeP);
            } else {
                tradingFee = request.positionDelta.mulPercentage(fee.makerFeeP);
            }
        } else {
            // 偏向空头
            if (request.isLong) {
                tradingFee = request.positionDelta.mulPercentage(fee.makerFeeP);
            } else {
                tradingFee = request.positionDelta.mulPercentage(fee.takerFeeP);
            }
        }
        require(position.collateral >= fee, "collateral not enough");

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);


        // 止盈
        if (request.tp > 0) {
            DecreasePositionRequest memory tpRequest = DecreasePositionRequest(
                account,
                TradeType.TP,
                pairIndex,
                collateral,
                request.tpPrice,
                isLong,
                request.tp
            );
            decreaseLimitRequests[decreaseLimitRequestsIndex] = tpRequest;
            decreaseLimitRequestsIndex = decreaseLimitRequestsIndex + 1;
        }
        if (request.sl > 0) {
            DecreasePositionRequest memory slRequest = DecreasePositionRequest(
                account,
                TradeType.SL,
                pairIndex,
                collateral,
                request.slPrice,
                isLong,
                pair.sl
            );
            decreaseLimitRequests[decreaseLimitRequestsIndex] = request;
            decreaseLimitRequestsIndex = decreaseLimitRequestsIndex + 1;
        }



    }

    function updateTpSl() {

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

    function getPrice(address _token, bool _isLong) public view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
