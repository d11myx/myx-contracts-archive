// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingRouter.sol";
import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITradingVault.sol";
import "../pair/interfaces/IPairVault.sol";
import "../libraries/PriceUtils.sol";

contract TradingRouter is ITradingRouter, ReentrancyGuardUpgradeable {

    using SafeERC20 for IERC20;
    using PriceUtils for uint256;

    enum TradeType {MARKET, LIMIT}

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

    }

    IPairInfo pairInfo;
    IPairVault pairVault;
    ITradingVault tradingVault;

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

    mapping(uint256 => uint256) public indexTokenPrice; // todo for test


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
        uint256 openPrice,             // 1e30 市价可接受价格/限价开仓价格
        bool isLong,                     // 多/空
        uint leverage,              // 杠杆
        uint256 tpPrice,                    // PRECISION 止盈
        uint256 tp,
        uint256 slPrice,                    // 止损
        uint256 sl
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

        int256 netExposureAmountChecker = tradingVault.netExposureAmountChecker(pairIndex);
        uint256 price = _getPrice(pairIndex);

        // check price
        if (request.tradeType == TradeType.MARKET) {
            require(request.isLong ? price <= request.openPrice : price >= request.openPrice, "exceed acceptable price");
        } else {
            require(request.isLong ? price >= request.openPrice : price <= request.openPrice, "not reach trigger price");
        }

        // check reserve
        uint256 positionAmount = request.positionDelta.getAmount(price);

        if (netExposureAmountChecker >= 0) {
            // 偏向多头
            if (request.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;

                require(positionAmount <= availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(positionAmount <= netExposureAmountChecker + availableStable.getAmount(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (request.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(positionAmount <= - netExposureAmountChecker + availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(positionAmount <= availableStable.getAmount(price), "lp stable token not enough");
            }
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

    // todo for test
    function setIndexTokenPrice(uint256 _pairToken, uint256 _price) external {
        indexTokenPrice[_pairToken] = _price;
    }

    // todo
    function _getPrice(uint256 _pairIndex) internal view returns(uint256) {
        return indexTokenPrice[_pairIndex];
    }

}
