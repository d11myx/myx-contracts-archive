// SPDX-License-Identifier: MIT
import '@chainlink/contracts/src/v0.8/ChainlinkClient.sol';
import './TWAPPriceGetter.sol';

import './interfaces/ChainlinkFeedInterface.sol';
import '../trading/interfaces/CallbacksInterfaceV6_2.sol';
import '../trading/interfaces/StorageInterfaceV5.sol';
import '../pair/interfaces/PairsStorageInterfaceV6.sol';

pragma solidity 0.8.17;

contract GNSPriceAggregatorV6_3 is ChainlinkClient, TWAPPriceGetter {
    using Chainlink for Chainlink.Request;

    // Contracts (constant)
    StorageInterfaceV5 public immutable storageT;

    // Contracts (adjustable)
    PairsStorageInterfaceV6 public pairsStorage;
    IChainlinkPriceFeed public linkPriceFeed;

    // Params (constant)
    uint constant PRECISION = 1e10;
    uint constant MAX_ORACLE_NODES = 20;
    uint constant MIN_ANSWERS = 3;

    // Params (adjustable)
    uint public minAnswers;

    struct Order {
        uint pairIndex;
        OrderType orderType;
        uint linkFeePerNode;
        bool initiated;
    }

    // State
    address[] public nodes;

    mapping(uint => Order) public orders;
    mapping(bytes32 => uint) public orderIdByRequest;
    mapping(uint => uint[]) public ordersAnswers;

    mapping(uint => PendingSl) private _pendingSlOrders;

    // Events
    event PairsStorageUpdated(address value);
    event LinkPriceFeedUpdated(address value);
    event MinAnswersUpdated(uint value);

    event NodeAdded(uint index, address value);
    event NodeReplaced(uint index, address oldNode, address newNode);
    event NodeRemoved(uint index, address oldNode);

    event PriceRequested(
        uint indexed orderId,
        bytes32 indexed job,
        uint indexed pairIndex,
        OrderType orderType,
        uint nodesCount,
        uint linkFeePerNode
    );

    event PriceReceived(
        bytes32 request,
        uint indexed orderId,
        address indexed node,
        uint indexed pairIndex,
        uint price,
        uint referencePrice,
        uint linkFee
    );

    constructor(
        address _linkToken,
        IUniswapV3Pool _tokenDaiLp,
        uint32 _twapInterval,
        StorageInterfaceV5 _storageT,
        PairsStorageInterfaceV6 _pairsStorage,
        IChainlinkPriceFeed _linkPriceFeed,
        uint _minAnswers,
        address[] memory _nodes
    ) TWAPPriceGetter(_tokenDaiLp, address(_storageT.token()), _twapInterval, PRECISION){

        require(address(_storageT) != address(0)
        && address(_pairsStorage) != address(0)
        && address(_linkPriceFeed) != address(0)
        && _minAnswers >= MIN_ANSWERS
        && _minAnswers % 2 == 1
        && _nodes.length > 0
            && _linkToken != address(0), "WRONG_PARAMS");

        storageT = _storageT;

        pairsStorage = _pairsStorage;
        linkPriceFeed = _linkPriceFeed;

        minAnswers = _minAnswers;
        nodes = _nodes;

        setChainlinkToken(_linkToken);
    }

    // Modifiers
    modifier onlyGov(){
        require(msg.sender == storageT.gov(), "GOV_ONLY");
        _;
    }
    modifier onlyTrading(){
        require(msg.sender == storageT.trading(), "TRADING_ONLY");
        _;
    }
    modifier onlyCallbacks(){
        require(msg.sender == storageT.callbacks(), "CALLBACKS_ONLY");
        _;
    }

    // Manage contracts
    function updatePairsStorage(PairsStorageInterfaceV6 value) external onlyGov {
        require(address(value) != address(0), "VALUE_0");

        pairsStorage = value;

        emit PairsStorageUpdated(address(value));
    }

    function updateLinkPriceFeed(IChainlinkPriceFeed value) external onlyGov {
        require(address(value) != address(0), "VALUE_0");

        linkPriceFeed = value;

        emit LinkPriceFeedUpdated(address(value));
    }

    // Manage TWAP variables
    function updateUniV3Pool(IUniswapV3Pool _uniV3Pool) external onlyGov {
        _updateUniV3Pool(_uniV3Pool);
    }

    function updateTwapInterval(uint32 _twapInterval) external onlyGov {
        _updateTwapInterval(_twapInterval);
    }

    // Manage params
    function updateMinAnswers(uint value) external onlyGov {
        require(value >= MIN_ANSWERS, "MIN_ANSWERS");
        require(value % 2 == 1, "EVEN");

        minAnswers = value;

        emit MinAnswersUpdated(value);
    }

    // Manage nodes
    function addNode(address a) external onlyGov {
        require(a != address(0), "VALUE_0");
        require(nodes.length < MAX_ORACLE_NODES, "MAX_ORACLE_NODES");

        for (uint i = 0; i < nodes.length; i++) {
            require(nodes[i] != a, "ALREADY_LISTED");
        }

        nodes.push(a);

        emit NodeAdded(nodes.length - 1, a);
    }

    function replaceNode(uint index, address a) external onlyGov {
        require(index < nodes.length, "WRONG_INDEX");
        require(a != address(0), "VALUE_0");

        emit NodeReplaced(index, nodes[index], a);

        nodes[index] = a;
    }

    function removeNode(uint index) external onlyGov {
        require(index < nodes.length, "WRONG_INDEX");

        emit NodeRemoved(index, nodes[index]);

        nodes[index] = nodes[nodes.length - 1];
        nodes.pop();
    }

    // On-demand price request to oracles network
    function getPrice(
        uint pairIndex,
        OrderType orderType,
        uint leveragedPosDai
    ) external onlyTrading returns (uint){
        // todo job ?
        (string memory from, string memory to, bytes32 job, uint orderId) =
        pairsStorage.pairJob(pairIndex);

        // 构造chainlink 请求
        Chainlink.Request memory linkRequest = buildChainlinkRequest(
            job,
            address(this),
            this.fulfill.selector
        );

        linkRequest.add("from", from);
        linkRequest.add("to", to);

        // chainlink 手续费
        uint linkFeePerNode = linkFee(pairIndex, leveragedPosDai) / nodes.length;

        orders[orderId] = Order(
            pairIndex,
            orderType,
            linkFeePerNode,
            true
        );

        for (uint i = 0; i < nodes.length; i ++) {
            orderIdByRequest[sendChainlinkRequestTo(
                nodes[i],
                linkRequest,
                linkFeePerNode
            )] = orderId;
        }

        emit PriceRequested(
            orderId,
            job,
            pairIndex,
            orderType,
            nodes.length,
            linkFeePerNode
        );

        return orderId;
    }

    // Fulfill on-demand price requests
    function fulfill(
        bytes32 requestId,
        uint price
    ) external recordChainlinkFulfillment(requestId) {

        uint orderId = orderIdByRequest[requestId];
        Order memory order = orders[orderId];

        delete orderIdByRequest[requestId];

        if (!order.initiated) {
            return;
        }

        uint[] storage answers = ordersAnswers[orderId];
        uint feedPrice;

        // 获取feedPrice
        PairsStorageInterfaceV6.Feed memory feed = pairsStorage.pairFeed(order.pairIndex);
        (, int feedPrice1, , ,) = IChainlinkPriceFeed(feed.feed1).latestRoundData();

        if (feed.feedCalculation == PairsStorageInterfaceV6.FeedCalculation.DEFAULT) {
            feedPrice = uint(feedPrice1 * int(PRECISION) / 1e8);

        } else if (feed.feedCalculation == PairsStorageInterfaceV6.FeedCalculation.INVERT) {
            feedPrice = uint(int(PRECISION) * 1e8 / feedPrice1);

        } else {
            (, int feedPrice2, , ,) = IChainlinkPriceFeed(feed.feed2).latestRoundData();
            feedPrice = uint(feedPrice1 * int(PRECISION) / feedPrice2);
        }

        // 比对price与feedPrice 防止偏差过大
        if (price == 0
            || (price >= feedPrice ? price - feedPrice : feedPrice - price)
                * PRECISION * 100 / feedPrice <= feed.maxDeviationP) {

            answers.push(price);

            if (answers.length == minAnswers) {
                CallbacksInterfaceV6_2.AggregatorAnswer memory answer;

                answer.orderId = orderId;
                answer.price = median(answers);
                answer.spreadP = pairsStorage.pairSpreadP(order.pairIndex);

                CallbacksInterfaceV6_2 callback = CallbacksInterfaceV6_2(storageT.callbacks());

                if (order.orderType == OrderType.MARKET_OPEN) {
                    callback.openTradeMarketCallback(answer);

                } else if (order.orderType == OrderType.MARKET_CLOSE) {
                    callback.closeTradeMarketCallback(answer);

                } else if (order.orderType == OrderType.LIMIT_OPEN) {
                    callback.executeNftOpenOrderCallback(answer);

                } else if (order.orderType == OrderType.LIMIT_CLOSE) {
                    callback.executeNftCloseOrderCallback(answer);

                } else {
                    callback.updateSlCallback(answer);
                }

                delete orders[orderId];
                delete ordersAnswers[orderId];
            }

            emit PriceReceived(
                requestId,
                orderId,
                msg.sender,
                order.pairIndex,
                price,
                feedPrice,
                order.linkFeePerNode
            );
        }
    }

    // Calculate LINK fee for each request
    function linkFee(uint pairIndex, uint leveragedPosDai) public view returns (uint){
        (, int linkPriceUsd, , ,) = linkPriceFeed.latestRoundData();

        return pairsStorage.pairOracleFeeP(pairIndex)
        * leveragedPosDai * 1e8 / uint(linkPriceUsd) / PRECISION / 100;
    }

    // Manage pending SL orders
    function pendingSlOrders(uint orderId) external view override returns (PendingSl memory) {
        return _pendingSlOrders[orderId];
    }

    function storePendingSlOrder(uint orderId, PendingSl calldata p) external onlyTrading {
        _pendingSlOrders[orderId] = p;
    }

    function unregisterPendingSlOrder(uint orderId) external {
        require(msg.sender == storageT.callbacks(), "CALLBACKS_ONLY");

        delete _pendingSlOrders[orderId];
    }

    // Claim back LINK tokens (if contract will be replaced for example)
    function claimBackLink() external onlyGov {
        TokenInterfaceV5 link = storageT.linkErc677();

        link.transfer(storageT.gov(), link.balanceOf(address(this)));
    }

    // Median function
    function swap(uint[] memory array, uint i, uint j) private pure {
        (array[i], array[j]) = (array[j], array[i]);
    }

    function sort(uint[] memory array, uint begin, uint end) private pure {
        if (begin >= end) {return;}

        uint j = begin;
        uint pivot = array[j];

        for (uint i = begin + 1; i < end; ++i) {
            if (array[i] < pivot) {
                swap(array, i, ++j);
            }
        }

        swap(array, begin, j);
        sort(array, begin, j);
        sort(array, j + 1, end);
    }

    function median(uint[] memory array) private pure returns (uint){
        sort(array, 0, array.length);

        return array.length % 2 == 0 ?
        (array[array.length / 2 - 1] + array[array.length / 2]) / 2 :
        array[array.length / 2];
    }

    // Storage v5 compatibility
    function openFeeP(uint pairIndex) external view returns (uint){
        return pairsStorage.pairOpenFeeP(pairIndex);
    }
}