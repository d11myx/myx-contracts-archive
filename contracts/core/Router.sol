// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../libraries/PositionKey.sol";
import "../libraries/Upgradeable.sol";
import "../libraries/Multicall.sol";
import "../interfaces/IRouter.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/ILiquidityCallback.sol";
import "../interfaces/ISwapCallback.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IOrderCallback.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../libraries/TradingTypes.sol";

contract Router is
    Multicall,
    IRouter,
    ILiquidityCallback,
    IOrderCallback,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using Int256Utils for uint256;

    IAddressesProvider public immutable ADDRESS_PROVIDER;
    IOrderManager public immutable orderManager;
    IPositionManager public immutable positionManager;
    IPool public immutable pool;

    constructor(
        IAddressesProvider addressProvider,
        IOrderManager _orderManager,
        IPositionManager _positionManager,
        IPool _pool)
    {
        ADDRESS_PROVIDER = addressProvider;
        orderManager = _orderManager;
        positionManager = _positionManager;
        pool = _pool;
    }

    modifier onlyPoolAdmin() {
        require(
            IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender),
            "onlyPoolAdmin"
        );
        _;
    }

    modifier onlyOrderManager() {
        require(msg.sender == address(orderManager), "onlyOrderManager");
        _;
    }

    modifier onlyPool() {
        require(msg.sender == address(pool), "onlyPool");
        _;
    }

    function salvageToken(address token, uint amount) external onlyPoolAdmin {
        IERC20(token).transfer(msg.sender, amount);
    }

    function setPaused() external onlyPoolAdmin {
        _pause();
    }

    function setUnPaused() external onlyPoolAdmin {
        _unpause();
    }

    function wrapWETH(address recipient) external payable {
        IWETH(ADDRESS_PROVIDER.WETH()).deposit{value: msg.value}();
        IWETH(ADDRESS_PROVIDER.WETH()).transfer(recipient, msg.value);
    }

    function setPriceAndAdjustCollateral(
        uint256 pairIndex,
        bool isLong,
        int256 collateral,
        address[] calldata tokens,
        bytes[] calldata updateData
    ) external payable whenNotPaused nonReentrant {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);

        positionManager.adjustCollateral(pairIndex, msg.sender, isLong, collateral);
    }

    function setPriceAndUpdateFundingRate(
        uint256 pairIndex,
        address[] calldata tokens,
        bytes[] calldata updateData
    ) external payable whenNotPaused nonReentrant {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);

        positionManager.updateFundingRate(pairIndex);
    }

    function createIncreaseOrderWithTpSl(
        TradingTypes.IncreasePositionWithTpSlRequest memory request
    ) external payable whenNotPaused nonReentrant returns (uint256 orderId) {
        request.account = msg.sender;

        require(
            request.tradeType != TradingTypes.TradeType.TP &&
                request.tradeType != TradingTypes.TradeType.SL,
            "not support"
        );

        orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: request.account,
                pairIndex: request.pairIndex,
                tradeType: request.tradeType,
                collateral: request.collateral,
                openPrice: request.openPrice,
                isLong: request.isLong,
                sizeAmount: uint256(request.sizeAmount).safeConvertToInt256(),
                maxSlippage: request.maxSlippage,
                paymentType: TradingTypes.convertPaymentType(request.paymentType),
                networkFeeAmount: request.networkFeeAmount,
                data: abi.encode(request.account)
            })
        );

        // tp、sl
        _createTpSl(
            request.account,
            request.pairIndex,
            request.isLong,
            request.tpPrice,
            request.tp,
            request.slPrice,
            request.sl,
            request.paymentType,
            request.networkFeeAmount
        );
        return orderId;
    }

    function _createTpSl(
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 tpPrice,
        uint128 tp,
        uint256 slPrice,
        uint128 sl,
        TradingTypes.NetworkFeePaymentType paymentType,
        uint256 networkFeeAmount
    ) public payable returns (uint256 tpOrderId, uint256 slOrderId) {
        require(msg.sender == address(this), "internal");
        if (tp > 0) {
            tpOrderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: account,
                    pairIndex: pairIndex,
                    tradeType: TradingTypes.TradeType.TP,
                    collateral: 0,
                    openPrice: tpPrice,
                    isLong: isLong,
                    sizeAmount: -(uint256(tp).safeConvertToInt256()),
                    maxSlippage: 0,
                    paymentType: TradingTypes.convertPaymentType(paymentType),
                    networkFeeAmount: networkFeeAmount,
                    data: abi.encode(account)
                })
            );
        }
        if (sl > 0) {
            slOrderId = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: account,
                    pairIndex: pairIndex,
                    tradeType: TradingTypes.TradeType.SL,
                    collateral: 0,
                    openPrice: slPrice,
                    isLong: isLong,
                    sizeAmount: -(uint256(sl).safeConvertToInt256()),
                    maxSlippage: 0,
                    paymentType: TradingTypes.convertPaymentType(paymentType),
                    networkFeeAmount: networkFeeAmount,
                    data: abi.encode(account)
                })
            );
        }
        return (tpOrderId, slOrderId);
    }

    function createIncreaseOrder(
        TradingTypes.IncreasePositionRequest memory request
    ) external payable whenNotPaused nonReentrant returns (uint256 orderId) {
        request.account = msg.sender;

        require(
            request.tradeType != TradingTypes.TradeType.TP &&
                request.tradeType != TradingTypes.TradeType.SL,
            "not support"
        );

        return
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: request.account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.openPrice,
                    isLong: request.isLong,
                    sizeAmount: request.sizeAmount.safeConvertToInt256(),
                    maxSlippage: request.maxSlippage,
                    paymentType: TradingTypes.convertPaymentType(request.paymentType),
                    networkFeeAmount: request.networkFeeAmount,
                    data: abi.encode(request.account)
                })
            );
    }

    function createDecreaseOrder(
        TradingTypes.DecreasePositionRequest memory request
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        request.account = msg.sender;

        return
            orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: request.account,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.triggerPrice,
                    isLong: request.isLong,
                    sizeAmount: -(request.sizeAmount.safeConvertToInt256()),
                    maxSlippage: request.maxSlippage,
                    paymentType: TradingTypes.convertPaymentType(request.paymentType),
                    networkFeeAmount: request.networkFeeAmount,
                    data: abi.encode(request.account)
                })
            );
    }

    function createDecreaseOrders(
        TradingTypes.DecreasePositionRequest[] memory requests
    ) external payable whenNotPaused nonReentrant returns (uint256[] memory orderIds) {
        orderIds = new uint256[](requests.length);
        for (uint256 i = 0; i < requests.length; i++) {
            TradingTypes.DecreasePositionRequest memory request = requests[i];

            orderIds[i] = orderManager.createOrder(
                TradingTypes.CreateOrderRequest({
                    account: msg.sender,
                    pairIndex: request.pairIndex,
                    tradeType: request.tradeType,
                    collateral: request.collateral,
                    openPrice: request.triggerPrice,
                    isLong: request.isLong,
                    sizeAmount: -(request.sizeAmount.safeConvertToInt256()),
                    maxSlippage: request.maxSlippage,
                    paymentType: TradingTypes.convertPaymentType(request.paymentType),
                    networkFeeAmount: request.networkFeeAmount,
                    data: abi.encode(msg.sender)
                })
            );
        }
        return orderIds;
    }

    function _checkOrderAccount(
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        bool isIncrease
    ) private view {
        if (isIncrease) {
            TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(
                orderId,
                tradeType
            );
            require(order.account == msg.sender, "onlyAccount");
        } else {
            TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
                orderId,
                tradeType
            );
            require(order.account == msg.sender, "onlyAccount");
        }
    }

    function cancelOrder(CancelOrderRequest memory request) external whenNotPaused nonReentrant {
        _checkOrderAccount(request.orderId, request.tradeType, request.isIncrease);
        orderManager.cancelOrder(
            request.orderId,
            request.tradeType,
            request.isIncrease,
            "cancelOrder"
        );
    }

    function cancelOrders(
        CancelOrderRequest[] memory requests
    ) external whenNotPaused nonReentrant {
        for (uint256 i = 0; i < requests.length; i++) {
            CancelOrderRequest memory request = requests[i];
            _checkOrderAccount(request.orderId, request.tradeType, request.isIncrease);
            orderManager.cancelOrder(
                request.orderId,
                request.tradeType,
                request.isIncrease,
                "cancelOrders"
            );
        }
    }

    function cancelPositionOrders(
        uint256 pairIndex,
        bool isLong,
        bool isIncrease
    ) external whenNotPaused nonReentrant {
        bytes32 key = PositionKey.getPositionKey(msg.sender, pairIndex, isLong);
        IOrderManager.PositionOrder[] memory orders = orderManager.getPositionOrders(key);

        for (uint256 i = 0; i < orders.length; i++) {
            IOrderManager.PositionOrder memory positionOrder = orders[i];
            require(positionOrder.account == msg.sender, "onlyAccount");
            if (isIncrease && positionOrder.isIncrease) {
                orderManager.cancelOrder(
                    positionOrder.orderId,
                    positionOrder.tradeType,
                    true,
                    "cancelOrders"
                );
            } else if (!isIncrease && !positionOrder.isIncrease) {
                orderManager.cancelOrder(
                    positionOrder.orderId,
                    positionOrder.tradeType,
                    false,
                    "cancelOrders"
                );
            }
        }
    }

    function addOrderTpSl(
        AddOrderTpSlRequest memory request
    ) external payable whenNotPaused nonReentrant returns (uint256 tpOrderId, uint256 slOrderId) {
        uint256 pairIndex;
        bool isLong;
        if (request.isIncrease) {
            TradingTypes.IncreasePositionOrder memory order = orderManager.getIncreaseOrder(
                request.orderId,
                request.tradeType
            );
            require(order.account == msg.sender, "no access");
            pairIndex = order.pairIndex;
            isLong = order.isLong;
        } else {
            TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
                request.orderId,
                request.tradeType
            );
            require(order.account == msg.sender, "no access");
            pairIndex = order.pairIndex;
            isLong = order.isLong;
        }

        if (request.tp > 0 || request.sl > 0) {
            _createTpSl(
                msg.sender,
                pairIndex,
                isLong,
                request.tpPrice,
                request.tp,
                request.slPrice,
                request.sl,
                request.paymentType,
                request.networkFeeAmount
            );
        }
        return (tpOrderId, slOrderId);
    }

    function createTpSl(
        TradingTypes.CreateTpSlRequest memory request
    ) external payable whenNotPaused nonReentrant returns (uint256 tpOrderId, uint256 slOrderId) {
        (tpOrderId, slOrderId) = _createTpSl(
            msg.sender,
            request.pairIndex,
            request.isLong,
            request.tpPrice,
            request.tp,
            request.slPrice,
            request.sl,
            request.paymentType,
            request.networkFeeAmount
        );
        return (tpOrderId, slOrderId);
    }

    function addLiquidityETH(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount,
        address[] calldata tokens,
        bytes[] calldata updateData,
        uint256 updateFee
    )
    external
    payable
    whenNotPaused
    nonReentrant
    returns (uint256 mintAmount, address slipToken, uint256 slipAmount)
    {
        require(msg.value >= indexAmount + updateFee, "ne");

        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: updateFee}(tokens, updateData);

        uint256 wrapAmount = msg.value - updateFee;
        this.wrapWETH{value: wrapAmount}(address(this));

        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        (mintAmount, slipToken, slipAmount) = IPool(pool).addLiquidity(
            msg.sender,
            pairIndex,
            indexAmount,
            stableAmount,
            abi.encode(msg.sender)
        );

        if (wrapAmount - indexAmount > 0) {
            IWETH(ADDRESS_PROVIDER.WETH()).safeTransfer(msg.sender, wrapAmount - indexAmount);
        }
    }

    function addLiquidity(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount,
        address[] calldata tokens,
        bytes[] calldata updateData
    )
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 mintAmount, address slipToken, uint256 slipAmount)
    {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);

        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        require(pairIndex > 0, "!exists");

        if (indexToken == ADDRESS_PROVIDER.WETH()) {
            IWETH(ADDRESS_PROVIDER.WETH()).safeTransferFrom(msg.sender, address(this), indexAmount);
        }

        return
            IPool(pool).addLiquidity(
                msg.sender,
                pairIndex,
                indexAmount,
                stableAmount,
                abi.encode(msg.sender)
            );
    }

    function addLiquidityForAccount(
        address indexToken,
        address stableToken,
        address receiver,
        uint256 indexAmount,
        uint256 stableAmount,
        address[] calldata tokens,
        bytes[] calldata updateData
    )
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 mintAmount, address slipToken, uint256 slipAmount)
    {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        require(pairIndex > 0, "!exists");

        if (indexToken == ADDRESS_PROVIDER.WETH()) {
            IWETH(ADDRESS_PROVIDER.WETH()).safeTransferFrom(msg.sender, address(this), indexAmount);
        }
        return
            IPool(pool).addLiquidity(
                receiver,
                pairIndex,
                indexAmount,
                stableAmount,
                abi.encode(msg.sender)
            );
    }

    function removeLiquidity(
        address indexToken,
        address stableToken,
        uint256 amount,
        bool useETH,
        address[] calldata tokens,
        bytes[] calldata updateData
    )
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount)
    {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return
            IPool(pool).removeLiquidity(
                payable(msg.sender),
                pairIndex,
                amount,
                useETH,
                abi.encode(msg.sender)
            );
    }

    function removeLiquidityForAccount(
        address indexToken,
        address stableToken,
        address receiver,
        uint256 amount,
        bool useETH,
        address[] calldata tokens,
        bytes[] calldata updateData
    )
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount)
    {
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(tokens, updateData);
        uint256 pairIndex = IPool(pool).getPairIndex(indexToken, stableToken);
        return
            IPool(pool).removeLiquidity(
                payable(receiver),
                pairIndex,
                amount,
                useETH,
                abi.encode(msg.sender)
            );
    }

    function removeLiquidityCallback(
        address pairToken,
        uint256 amount,
        bytes calldata data
    ) external override onlyPool {
        address sender = abi.decode(data, (address));
        IERC20(pairToken).safeTransferFrom(sender, msg.sender, amount);
    }

    function createOrderCallback(
        address collateral,
        uint256 amount,
        address to,
        bytes calldata data
    ) external override onlyOrderManager {
        address sender = abi.decode(data, (address));

        if (amount > 0) {
            IERC20(collateral).safeTransferFrom(sender, to, uint256(amount));
        }
    }

    function addLiquidityCallback(
        address indexToken,
        address stableToken,
        uint256 amountIndex,
        uint256 amountStable,
        bytes calldata data
    ) external override onlyPool {
        address sender = abi.decode(data, (address));

        if (amountIndex > 0) {
            if (indexToken == ADDRESS_PROVIDER.WETH()) {
                IERC20(indexToken).safeTransferFrom(address(this), msg.sender, uint256(amountIndex));
            } else {
                IERC20(indexToken).safeTransferFrom(sender, msg.sender, uint256(amountIndex));
            }
        }
        if (amountStable > 0) {
            IERC20(stableToken).safeTransferFrom(sender, msg.sender, uint256(amountStable));
        }
    }
}
