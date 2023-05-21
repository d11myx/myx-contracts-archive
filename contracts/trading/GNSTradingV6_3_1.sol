// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import '../interfaces/StorageInterfaceV5.sol';
import '../interfaces/GNSPairInfosInterfaceV6.sol';
import '../interfaces/GNSReferralsInterfaceV6_2.sol';
import '../libraries/ChainUtils.sol';
import '../libraries/TradeUtils.sol';

pragma solidity 0.8.17;

contract GNSTradingV6_3_1 is PausableInterfaceV5, Initializable {
    using TradeUtils for address;

    // Contracts (constant)
    StorageInterfaceV5 public storageT;
    NftRewardsInterfaceV6_3_1 public nftRewards;
    GNSPairInfosInterfaceV6 public pairInfos;
    GNSReferralsInterfaceV6_2 public referrals;

    // Params (constant)
    uint constant PRECISION = 1e10;
    uint constant MAX_SL_P = 75;  // -75% PNL

    // Params (adjustable)
    uint public maxPosDai;            // 1e18 (eg. 75000 * 1e18)
    uint public marketOrdersTimeout;  // block (eg. 30)

    // State
    bool public isPaused;  // Prevent opening new trades
    bool public isDone;    // Prevent any interaction with the contract

    // Events
    event Done(bool done);
    event Paused(bool paused);

    event NumberUpdated(string name, uint value);

    event MarketOrderInitiated(
        uint indexed orderId,
        address indexed trader,
        uint indexed pairIndex,
        bool open
    );

    event OpenLimitPlaced(
        address indexed trader,
        uint indexed pairIndex,
        uint index
    );
    event OpenLimitUpdated(
        address indexed trader,
        uint indexed pairIndex,
        uint index,
        uint newPrice,
        uint newTp,
        uint newSl
    );
    event OpenLimitCanceled(
        address indexed trader,
        uint indexed pairIndex,
        uint index
    );

    event TpUpdated(
        address indexed trader,
        uint indexed pairIndex,
        uint index,
        uint newTp
    );
    event SlUpdated(
        address indexed trader,
        uint indexed pairIndex,
        uint index,
        uint newSl
    );
    event SlUpdateInitiated(
        uint indexed orderId,
        address indexed trader,
        uint indexed pairIndex,
        uint index,
        uint newSl
    );

    event NftOrderInitiated(
        uint orderId,
        address indexed nftHolder,
        address indexed trader,
        uint indexed pairIndex
    );
    event NftOrderSameBlock(
        address indexed nftHolder,
        address indexed trader,
        uint indexed pairIndex
    );

    event ChainlinkCallbackTimeout(
        uint indexed orderId,
        StorageInterfaceV5.PendingMarketOrder order
    );
    event CouldNotCloseTrade(
        address indexed trader,
        uint indexed pairIndex,
        uint index
    );

    function initialize(
        StorageInterfaceV5 _storageT,
        NftRewardsInterfaceV6_3_1 _nftRewards,
        GNSPairInfosInterfaceV6 _pairInfos,
        GNSReferralsInterfaceV6_2 _referrals,
        uint _maxPosDai,
        uint _marketOrdersTimeout
    ) external initializer {
        require(address(_storageT) != address(0)
        && address(_nftRewards) != address(0)
        && address(_pairInfos) != address(0)
        && address(_referrals) != address(0)
        && _maxPosDai > 0
            && _marketOrdersTimeout > 0, "WRONG_PARAMS");

        storageT = _storageT;
        nftRewards = _nftRewards;
        pairInfos = _pairInfos;
        referrals = _referrals;

        maxPosDai = _maxPosDai;
        marketOrdersTimeout = _marketOrdersTimeout;
    }

    // Modifiers
    modifier onlyGov(){
        isGov();
        _;
    }
    modifier notContract(){
        isNotContract();
        _;
    }
    modifier notDone(){
        isNotDone();
        _;
    }

    // Saving code size by calling these functions inside modifiers
    function isGov() private view {
        require(msg.sender == storageT.gov(), "GOV_ONLY");
    }

    function isNotContract() private view {
        require(tx.origin == msg.sender);
    }

    function isNotDone() private view {
        require(!isDone, "DONE");
    }

    // Manage params
    function setMaxPosDai(uint value) external onlyGov {
        require(value > 0, "VALUE_0");
        maxPosDai = value;

        emit NumberUpdated("maxPosDai", value);
    }

    function setMarketOrdersTimeout(uint value) external onlyGov {
        require(value > 0, "VALUE_0");
        marketOrdersTimeout = value;

        emit NumberUpdated("marketOrdersTimeout", value);
    }

    // Manage state
    function pause() external onlyGov {
        isPaused = !isPaused;

        emit Paused(isPaused);
    }

    function done() external onlyGov {
        isDone = !isDone;

        emit Done(isDone);
    }

    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    // Open new trade (MARKET/LIMIT)
    function openTrade(
        StorageInterfaceV5.Trade memory trade,
        NftRewardsInterfaceV6_3_1.OpenLimitOrderType orderType, // LEGACY => market
        uint spreadReductionId,
        uint slippageP, // for market orders only
        address referrer
    ) external notContract notDone {

        require(!isPaused, "PAUSED");
        require(trade.openPrice * slippageP < type(uint256).max, "OVERFLOW");

        AggregatorInterfaceV6_2 aggregator = storageT.priceAggregator();
        PairsStorageInterfaceV6 pairsStored = aggregator.pairsStorage();

        address sender = _msgSender();

        // 是否超过每个币对最大交易数
        require(storageT.openTradesCount(sender, trade.pairIndex)
        + storageT.pendingMarketOpenCount(sender, trade.pairIndex)
        + storageT.openLimitOrdersCount(sender, trade.pairIndex)
            < storageT.maxTradesPerPair(),
            "MAX_TRADES_PER_PAIR");

        // 最大pending状态订单
        require(storageT.pendingOrderIdsCount(sender)
            < storageT.maxPendingMarketOrders(),
            "MAX_PENDING_ORDERS");

        // 保证金及开仓价值大小
        require(trade.positionSizeDai <= maxPosDai, "ABOVE_MAX_POS");
        require(trade.positionSizeDai * trade.leverage
            >= pairsStored.pairMinLevPosDai(trade.pairIndex), "BELOW_MIN_POS");

        // 杠杆大小
        require(trade.leverage > 0 && trade.leverage >= pairsStored.pairMinLeverage(trade.pairIndex)
            && trade.leverage <= pairsStored.pairMaxLeverage(trade.pairIndex),
            "LEVERAGE_INCORRECT");

        // nft相关
        require(spreadReductionId == 0
            || storageT.nfts(spreadReductionId - 1).balanceOf(sender) > 0,
            "NO_CORRESPONDING_NFT_SPREAD_REDUCTION");

        // 做多时止盈价要大于开仓价 做空时止盈价小于开仓价
        require(trade.tp == 0 || (trade.buy ? trade.tp > trade.openPrice : trade.tp < trade.openPrice), "WRONG_TP");

        // 做多时止损价要小于开仓价 做空时止损价大于开仓价
        require(trade.sl == 0 || (trade.buy ? trade.sl < trade.openPrice : trade.sl > trade.openPrice), "WRONG_SL");

        // 价格影响因子，上浮或下浮开仓价格 todo 删除？
        (uint priceImpactP,) = pairInfos.getTradePriceImpact(
            0,
            trade.pairIndex,
            trade.buy,
            trade.positionSizeDai * trade.leverage
        );

        require(priceImpactP * trade.leverage <= pairInfos.maxNegativePnlOnOpenP(), "PRICE_IMPACT_TOO_HIGH");

        // 发送保证金 sender -> storage
        storageT.transferDai(sender, address(storageT), trade.positionSizeDai);

        if (orderType != NftRewardsInterfaceV6_3_1.OpenLimitOrderType.LEGACY) {
            // 限价单
            // 获取一个限价单index
            uint index = storageT.firstEmptyOpenLimitIndex(sender, trade.pairIndex);

            storageT.storeOpenLimitOrder(
                StorageInterfaceV5.OpenLimitOrder(
                    sender,
                    trade.pairIndex,
                    index,
                    trade.positionSizeDai,
                    spreadReductionId > 0 ? storageT.spreadReductionsP(spreadReductionId - 1) : 0,
                    trade.buy,
                    trade.leverage,
                    trade.tp,
                    trade.sl,
                    trade.openPrice,
                    trade.openPrice,
                    block.number,
                    0
                )
            );
            // nft? todo
            nftRewards.setOpenLimitOrderType(sender, t.pairIndex, index, orderType);
            // TradeUtils.setTradeLastUpdated
            storageT.callbacks().setTradeLastUpdated(
                sender,
                t.pairIndex,
                index,
                TradingCallbacksV6_3_1.TradeType.LIMIT,
                ChainUtils.getBlockNumber()
            );

            emit OpenLimitPlaced(
                sender,
                trade.pairIndex,
                index
            );

        } else {
            // 市价单
            // 发送获取价格请求到chainlink
            uint orderId = aggregator.getPrice(
                trade.pairIndex,
                AggregatorInterfaceV6_2.OrderType.MARKET_OPEN,
                trade.positionSizeDai * trade.leverage
            );

            storageT.storePendingMarketOrder(
                StorageInterfaceV5.PendingMarketOrder(
                    StorageInterfaceV5.Trade(
                        sender,
                        trade.pairIndex,
                        0,
                        0,
                        trade.positionSizeDai,
                        0,
                        trade.buy,
                        trade.leverage,
                        trade.tp,
                        trade.sl
                    ),
                    0,
                    trade.openPrice,
                    slippageP,
                    spreadReductionId > 0 ? storageT.spreadReductionsP(spreadReductionId - 1) : 0,
                    0
                ), orderId, true
            );

            emit MarketOrderInitiated(
                orderId,
                sender,
                trade.pairIndex,
                true
            );
        }
        // 邀请返佣
        referrals.registerPotentialReferrer(sender, referrer);
    }

    // Close trade (MARKET)
    function closeTradeMarket(
        uint pairIndex,
        uint index
    ) external notContract notDone {

        address sender = _msgSender();

        StorageInterfaceV5.Trade memory t = storageT.openTrades(
            sender, pairIndex, index
        );

        StorageInterfaceV5.TradeInfo memory i = storageT.openTradesInfo(
            sender, pairIndex, index
        );

        require(storageT.pendingOrderIdsCount(sender)
            < storageT.maxPendingMarketOrders(), "MAX_PENDING_ORDERS");

        require(!i.beingMarketClosed, "ALREADY_BEING_CLOSED");
        require(t.leverage > 0, "NO_TRADE");

        uint orderId = storageT.priceAggregator().getPrice(
            pairIndex,
            AggregatorInterfaceV6_2.OrderType.MARKET_CLOSE,
            t.initialPosToken * i.tokenPriceDai * t.leverage / PRECISION
        );

        storageT.storePendingMarketOrder(
            StorageInterfaceV5.PendingMarketOrder(
                StorageInterfaceV5.Trade(
                    sender, pairIndex, index, 0, 0, 0, false, 0, 0, 0
                ),
                0, 0, 0, 0, 0
            ), orderId, false
        );

        emit MarketOrderInitiated(
            orderId,
            sender,
            pairIndex,
            false
        );
    }

    // Manage limit order (OPEN)
    function updateOpenLimitOrder(
        uint pairIndex,
        uint index,
        uint price, // PRECISION
        uint tp,
        uint sl
    ) external notContract notDone {

        address sender = _msgSender();

        require(storageT.hasOpenLimitOrder(sender, pairIndex, index),
            "NO_LIMIT");

        StorageInterfaceV5.OpenLimitOrder memory o = storageT.getOpenLimitOrder(
            sender, pairIndex, index
        );

        require(tp == 0 || (o.buy ?
        tp > price :
        tp < price), "WRONG_TP");

        require(sl == 0 || (o.buy ?
        sl < price :
        sl > price), "WRONG_SL");

        checkNoPendingTrigger(sender, pairIndex, index, StorageInterfaceV5.LimitOrder.OPEN);

        o.minPrice = price;
        o.maxPrice = price;
        o.tp = tp;
        o.sl = sl;

        storageT.updateOpenLimitOrder(o);
        storageT.callbacks().setTradeLastUpdated(
            sender,
            pairIndex,
            index,
            TradingCallbacksV6_3_1.TradeType.LIMIT,
            ChainUtils.getBlockNumber()
        );

        emit OpenLimitUpdated(
            sender,
            pairIndex,
            index,
            price,
            tp,
            sl
        );
    }

    function cancelOpenLimitOrder(
        uint pairIndex,
        uint index
    ) external notContract notDone {

        address sender = _msgSender();

        require(storageT.hasOpenLimitOrder(sender, pairIndex, index),
            "NO_LIMIT");

        StorageInterfaceV5.OpenLimitOrder memory o = storageT.getOpenLimitOrder(
            sender, pairIndex, index
        );

        checkNoPendingTrigger(sender, pairIndex, index, StorageInterfaceV5.LimitOrder.OPEN);

        storageT.unregisterOpenLimitOrder(sender, pairIndex, index);
        storageT.transferDai(address(storageT), sender, o.positionSize);

        emit OpenLimitCanceled(
            sender,
            pairIndex,
            index
        );
    }

    // Manage limit order (TP/SL)
    function updateTp(
        uint pairIndex,
        uint index,
        uint newTp
    ) external notContract notDone {

        address sender = _msgSender();

        checkNoPendingTrigger(sender, pairIndex, index, StorageInterfaceV5.LimitOrder.TP);

        StorageInterfaceV5.Trade memory t = storageT.openTrades(
            sender, pairIndex, index
        );

        require(t.leverage > 0, "NO_TRADE");

        storageT.updateTp(sender, pairIndex, index, newTp);
        storageT.callbacks().setTpLastUpdated(
            sender,
            pairIndex,
            index,
            TradingCallbacksV6_3_1.TradeType.MARKET,
            ChainUtils.getBlockNumber()
        );

        emit TpUpdated(
            sender,
            pairIndex,
            index,
            newTp
        );
    }

    function updateSl(
        uint pairIndex,
        uint index,
        uint newSl
    ) external notContract notDone {

        address sender = _msgSender();

        checkNoPendingTrigger(sender, pairIndex, index, StorageInterfaceV5.LimitOrder.SL);

        StorageInterfaceV5.Trade memory t = storageT.openTrades(
            sender, pairIndex, index
        );

        StorageInterfaceV5.TradeInfo memory i = storageT.openTradesInfo(
            sender, pairIndex, index
        );

        require(t.leverage > 0, "NO_TRADE");

        uint maxSlDist = t.openPrice * MAX_SL_P / 100 / t.leverage;

        require(newSl == 0 || (t.buy ?
        newSl >= t.openPrice - maxSlDist :
        newSl <= t.openPrice + maxSlDist), "SL_TOO_BIG");

        AggregatorInterfaceV6_2 aggregator = storageT.priceAggregator();

        if (newSl == 0
            || !aggregator.pairsStorage().guaranteedSlEnabled(pairIndex)) {

            storageT.updateSl(sender, pairIndex, index, newSl);
            storageT.callbacks().setSlLastUpdated(
                sender,
                pairIndex,
                index,
                TradingCallbacksV6_3_1.TradeType.MARKET,
                ChainUtils.getBlockNumber()
            );

            emit SlUpdated(
                sender,
                pairIndex,
                index,
                newSl
            );

        } else {
            uint orderId = aggregator.getPrice(
                pairIndex,
                AggregatorInterfaceV6_2.OrderType.UPDATE_SL,
                t.initialPosToken * i.tokenPriceDai * t.leverage / PRECISION
            );

            aggregator.storePendingSlOrder(
                orderId,
                AggregatorInterfaceV6_2.PendingSl(
                    sender, pairIndex, index, t.openPrice, t.buy, newSl
                )
            );

            emit SlUpdateInitiated(
                orderId,
                sender,
                pairIndex,
                index,
                newSl
            );
        }
    }

    // Execute limit order
    function executeNftOrder(
        StorageInterfaceV5.LimitOrder orderType,
        address trader,
        uint pairIndex,
        uint index,
        uint nftId,
        uint nftType
    ) external notContract notDone {

        address sender = _msgSender();

        require(nftType >= 1 && nftType <= 5, "WRONG_NFT_TYPE");
        require(storageT.nfts(nftType - 1).ownerOf(nftId) == sender, "NO_NFT");

        require(block.number >=
            storageT.nftLastSuccess(nftId) + storageT.nftSuccessTimelock(),
            "SUCCESS_TIMELOCK");
        require(
            canExecute(
                orderType,
                TradingCallbacksV6_3_1.SimplifiedTradeId(
                    trader,
                    pairIndex,
                    index,
                    orderType == StorageInterfaceV5.LimitOrder.OPEN
                    ? TradingCallbacksV6_3_1.TradeType.LIMIT
                    : TradingCallbacksV6_3_1.TradeType.MARKET
                )
            ),
            "IN_TIMEOUT"
        );

        {
            (bytes32 nftHash, bytes32 botHash) = nftRewards.getNftBotHashes(
                block.number,
                sender,
                nftId,
                trader,
                pairIndex,
                index
            );
            require(!nftRewards.nftBotInUse(nftHash, botHash), "BOT_IN_USE");

            nftRewards.setNftBotInUse(nftHash, botHash);
        }

        StorageInterfaceV5.Trade memory t;

        if (orderType == StorageInterfaceV5.LimitOrder.OPEN) {
            require(storageT.hasOpenLimitOrder(trader, pairIndex, index),
                "NO_LIMIT");

        } else {
            t = storageT.openTrades(trader, pairIndex, index);

            require(t.leverage > 0, "NO_TRADE");

            if (orderType == StorageInterfaceV5.LimitOrder.LIQ) {
                uint liqPrice = pairInfos.getTradeLiquidationPrice(
                    t.trader,
                    t.pairIndex,
                    t.index,
                    t.openPrice,
                    t.buy,
                    t.initialPosToken * storageT.openTradesInfo(
                        t.trader, t.pairIndex, t.index
                    ).tokenPriceDai / PRECISION,
                    t.leverage
                );

                require(t.sl == 0 || (t.buy ?
                liqPrice > t.sl :
                liqPrice < t.sl), "HAS_SL");

            } else {
                require(orderType != StorageInterfaceV5.LimitOrder.SL || t.sl > 0,
                    "NO_SL");
                require(orderType != StorageInterfaceV5.LimitOrder.TP || t.tp > 0,
                    "NO_TP");
            }
        }

        NftRewardsInterfaceV6_3_1.TriggeredLimitId memory triggeredLimitId =
        NftRewardsInterfaceV6_3_1.TriggeredLimitId(
            trader, pairIndex, index, orderType
        );

        if (!nftRewards.triggered(triggeredLimitId)
        || nftRewards.timedOut(triggeredLimitId)) {

            uint leveragedPosDai;

            if (orderType == StorageInterfaceV5.LimitOrder.OPEN) {

                StorageInterfaceV5.OpenLimitOrder memory l = storageT.getOpenLimitOrder(
                    trader, pairIndex, index
                );

                leveragedPosDai = l.positionSize * l.leverage;

                (uint priceImpactP,) = pairInfos.getTradePriceImpact(
                    0,
                    l.pairIndex,
                    l.buy,
                    leveragedPosDai
                );

                require(priceImpactP * l.leverage <= pairInfos.maxNegativePnlOnOpenP(),
                    "PRICE_IMPACT_TOO_HIGH");

            } else {
                leveragedPosDai = t.initialPosToken * storageT.openTradesInfo(
                    trader, pairIndex, index
                ).tokenPriceDai * t.leverage / PRECISION;
            }

            storageT.transferLinkToAggregator(sender, pairIndex, leveragedPosDai);

            AggregatorInterfaceV6_2 aggregator = storageT.priceAggregator();
            uint orderId = aggregator.getPrice(
                pairIndex,
                orderType == StorageInterfaceV5.LimitOrder.OPEN ?
                AggregatorInterfaceV6_2.OrderType.LIMIT_OPEN :
                AggregatorInterfaceV6_2.OrderType.LIMIT_CLOSE,
                leveragedPosDai
            );

            storageT.storePendingNftOrder(
                StorageInterfaceV5.PendingNftOrder(
                    sender,
                    nftId,
                    trader,
                    pairIndex,
                    index,
                    orderType
                ), orderId
            );

            nftRewards.storeFirstToTrigger(triggeredLimitId, sender, aggregator.linkFee(pairIndex, leveragedPosDai));

            emit NftOrderInitiated(
                orderId,
                sender,
                trader,
                pairIndex
            );

        } else {
            nftRewards.storeTriggerSameBlock(triggeredLimitId, sender);

            emit NftOrderSameBlock(
                sender,
                trader,
                pairIndex
            );
        }
    }

    // Market timeout
    function openTradeMarketTimeout(uint _order) external notContract notDone {
        address sender = _msgSender();

        StorageInterfaceV5.PendingMarketOrder memory o =
        storageT.reqID_pendingMarketOrder(_order);

        StorageInterfaceV5.Trade memory t = o.trade;

        require(o.block > 0
            && block.number >= o.block + marketOrdersTimeout, "WAIT_TIMEOUT");

        require(t.trader == sender, "NOT_YOUR_ORDER");
        require(t.leverage > 0, "WRONG_MARKET_ORDER_TYPE");

        storageT.unregisterPendingMarketOrder(_order, true);
        storageT.transferDai(address(storageT), sender, t.positionSizeDai);

        emit ChainlinkCallbackTimeout(
            _order,
            o
        );
    }

    function closeTradeMarketTimeout(uint _order) external notContract notDone {
        address sender = _msgSender();

        StorageInterfaceV5.PendingMarketOrder memory o =
        storageT.reqID_pendingMarketOrder(_order);

        StorageInterfaceV5.Trade memory t = o.trade;

        require(o.block > 0
            && block.number >= o.block + marketOrdersTimeout, "WAIT_TIMEOUT");

        require(t.trader == sender, "NOT_YOUR_ORDER");
        require(t.leverage == 0, "WRONG_MARKET_ORDER_TYPE");

        storageT.unregisterPendingMarketOrder(_order, false);

        (bool success,) = address(this).delegatecall(
            abi.encodeWithSignature(
                "closeTradeMarket(uint256,uint256)",
                t.pairIndex,
                t.index
            )
        );

        if (!success) {
            emit CouldNotCloseTrade(
                sender,
                t.pairIndex,
                t.index
            );
        }

        emit ChainlinkCallbackTimeout(
            _order,
            o
        );
    }

    // Helpers
    function checkNoPendingTrigger(
        address trader,
        uint pairIndex,
        uint index,
        StorageInterfaceV5.LimitOrder orderType
    ) private view {
        NftRewardsInterfaceV6_3_1.TriggeredLimitId memory triggeredLimitId =
        NftRewardsInterfaceV6_3_1.TriggeredLimitId(
            trader, pairIndex, index, orderType
        );
        require(!nftRewards.triggered(triggeredLimitId)
        || nftRewards.timedOut(triggeredLimitId), "PENDING_TRIGGER");
    }

    function canExecute(
        StorageInterfaceV5.LimitOrder orderType,
        TradingCallbacksV6_3_1.SimplifiedTradeId memory id
    ) private view returns (bool) {
        if (orderType == StorageInterfaceV5.LimitOrder.LIQ)
            return true;

        uint b = ChainUtils.getBlockNumber();
        address cb = storageT.callbacks();

        if (orderType == StorageInterfaceV5.LimitOrder.TP)
            return !cb.isTpInTimeout(
                id,
                b
            );

        if (orderType == StorageInterfaceV5.LimitOrder.SL)
            return !cb.isSlInTimeout(
                id,
                b
            );

        return !cb.isLimitInTimeout(
            id,
            b
        );
    }
}