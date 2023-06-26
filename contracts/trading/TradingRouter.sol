// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingRouter.sol";
import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITradingVault.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable {

    using SafeERC20 for IERC20;

    enum TradeType {MARKET, LIMIT}

    struct IncreaseMarketRequest {
        address account;
        uint256 pairIndex;
        uint256 collateral;
        bool long;
        uint256 positionSize;
        uint256 tpPrice;
        uint256 tpAmount;
        uint256 slPrice;
        uint256 slAmount;
    }

    struct DecreaseMarketRequest {

    }

    struct IncreaseLimitRequest {
        address account;
        uint256 pairIndex;
        uint256 collateral;
        uint256 openPrice;
        bool long;
        uint256 positionSize;
        uint256 tpPrice;
        uint256 tpAmount;
        uint256 slPrice;
        uint256 slAmount;
    }

    struct DecreaseLimitRequest {

    }

    IPairInfo pairInfo;
    ITradingVault tradingVault;

    mapping(uint256 => IncreaseMarketRequest) public increaseMarketRequests;
    mapping(uint256 => DecreaseMarketRequest) public decreaseMarketRequests;
    uint256 public increaseMarketRequestsIndex;
    uint256 public decreaseMarketRequestsIndex;
    uint256 public increaseMarketRequestStartIndex;
    uint256 public decreaseMarketRequestStartIndex;

    mapping(uint256 => IncreaseLimitRequest) public increaseLimitRequests;
    mapping(uint256 => DecreaseLimitRequest) public decreaseLimitRequests;
    uint256 public increaseLimitRequestsIndex;
    uint256 public decreaseLimitRequestsIndex;
    uint256 public increaseLimitRequestStartIndex;
    uint256 public decreaseLimitRequestStartIndex;


    event IncreaseMarket(
        address account,
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
        TradeType tradeType,
        uint256 pairIndex,             // 币对index
        uint256 collateral,            // 1e18 保证金数量
        uint256 openPrice,             // 1e30 限价开仓价格
        bool long,                     // 多/空
        uint leverage,              // 杠杆
        uint256 tpPrice,                    // PRECISION 止盈
        uint256 tpAmount,
        uint256 slPrice,                    // 止损
        uint256 slAmount
    ) external nonReentrant returns(uint256 requestIndex) {
        address account = msg.sender;

        IPairInfo.Pair pair = pairInfo.getPair(pairIndex);

        require(tradingVault.isFrozen(request.account), "account is frozen");
        require(pair.enable, "trade pair not supported");
        require(leverage >= pair.minLeverage && leverage <= pair.maxLeverage, "leverage incorrect");

        require(collateral > 0, "invalid collateral");
        uint256 positionSize = collateral * leverage;
        require(tpAmount <= positionSize && slAmount <= positionSize, "tp/sl exceeds max size");
        require(positionSize >= pair.minSize && positionSize <= pair.maxSize, "invalid size");

        IERC20(pair.stableToken).safeTransferFrom(account, address(this), collateral);

        if (tradeType == TradeType.MARKET) {
            IncreaseMarketRequest memory request = IncreaseMarketRequest(
                account,
                pairIndex,
                collateral,
                long,
                positionSize,
                tpPrice,
                tpAmount,
                slPrice,
                slAmount
            );
            increaseMarketRequests[increaseMarketRequestsIndex] = request;
            requestIndex = increaseMarketRequestsIndex;
            increaseMarketRequestsIndex = increaseMarketRequestsIndex + 1;

            emit IncreaseMarket(
                account,
                pairIndex,
                collateral,
                long,
                positionSize,
                tpPrice,
                tpAmount,
                slPrice,
                slAmount
            );
            return requestIndex;
        } else {
            require(tpPrice == 0 || (long ? tpPrice > openPrice : tpPrice < openPrice), "wrong tp price");
            require(slPrice == 0 || (long ? slPrice < openPrice : slPrice > openPrice), "wrong sl price");
            IncreaseLimitRequest memory request = IncreaseLimitRequest(
                account,
                pairIndex,
                collateral,
                openPrice,
                long,
                positionSize,
                tpPrice,
                tpAmount,
                slPrice,
                slAmount
            );
            increaseLimitRequests[increaseLimitRequestsIndex] = request;
            requestIndex = increaseLimitRequestsIndex;
            increaseLimitRequestsIndex = increaseLimitRequestsIndex + 1;

            emit IncreaseLimitRequest(
                account,
                pairIndex,
                collateral,
                openPrice,
                long,
                positionSize,
                tpPrice,
                tpAmount,
                slPrice,
                slAmount
            );
            return requestIndex;
        }
    }

    function executeIncreasePosition(uint256 requestIndex) {
        IncreaseMarketRequest memory request = increaseMarketRequests[requestIndex];

        IPairInfo.Pair pair = pairInfo.getPair(request.pairIndex);

        require(pair.enable, "trade pair not supported");
        require(leverage >= pair.minLeverage && leverage <= pair.maxLeverage, "leverage incorrect");

        require(tradingVault.isFrozen(request.account), "account is frozen");





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

}
