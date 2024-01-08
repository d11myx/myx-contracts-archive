// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import '../../libraries/Position.sol';
import '../../interfaces/ILiquidationLogic.sol';
import '../../interfaces/IAddressesProvider.sol';
import '../../interfaces/IRoleManager.sol';
import '../../interfaces/IOrderManager.sol';
import '../../interfaces/IPositionManager.sol';
import '../../interfaces/IPool.sol';
import '../../helpers/TradingHelper.sol';
import '../../interfaces/IFeeCollector.sol';

contract LiquidationLogic is ILiquidationLogic {
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;
    using Int256Utils for uint256;
    using Position for Position.Info;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IPool public immutable pool;
    IOrderManager public immutable orderManager;
    IPositionManager public immutable positionManager;
    IFeeCollector public immutable feeCollector;
    address public executor;

    constructor(
        IAddressesProvider addressProvider,
        IPool _pool,
        IOrderManager _orderManager,
        IPositionManager _positionManager,
        IFeeCollector _feeCollector
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pool = _pool;
        orderManager = _orderManager;
        positionManager = _positionManager;
        feeCollector = _feeCollector;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), "opa");
        _;
    }

    modifier onlyExecutorOrSelf() {
        require(msg.sender == executor || msg.sender == address(this), "oe");
        _;
    }

    function updateExecutor(address _executor) external override onlyPoolAdmin {
        address oldAddress = executor;
        executor = _executor;
        emit UpdateExecutorAddress(msg.sender, oldAddress, _executor);
    }

    function liquidatePositions(
        address keeper,
        ExecutePosition[] memory executePositions
    ) external override onlyExecutorOrSelf {
        for (uint256 i = 0; i < executePositions.length; i++) {
            ExecutePosition memory execute = executePositions[i];
            try
                this.liquidationPosition(
                    keeper,
                    execute.positionKey,
                    execute.tier,
                    execute.referralsRatio,
                    execute.referralUserRatio,
                    execute.referralOwner
                )
            {} catch Error(string memory reason) {
                emit ExecutePositionError(execute.positionKey, reason);
            }
        }
    }

    function liquidationPosition(
        address keeper,
        bytes32 positionKey,
        uint8 tier,
        uint256 referralsRatio,
        uint256 referralUserRatio,
        address referralOwner
    ) external override onlyExecutorOrSelf {
        Position.Info memory position = positionManager.getPositionByKey(positionKey);
        if (position.positionAmount == 0) {
            emit ZeroPosition(keeper, position.account, position.pairIndex, position.isLong, 'liquidation');
            return;
        }
        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        uint256 price = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );

        bool needLiquidate = _needLiquidation(positionKey, price);
        if (!needLiquidate) {
            return;
        }

        uint256 orderId = orderManager.createOrder(
            TradingTypes.CreateOrderRequest({
                account: position.account,
                pairIndex: position.pairIndex,
                tradeType: TradingTypes.TradeType.MARKET,
                collateral: 0,
                openPrice: price,
                isLong: position.isLong,
                sizeAmount: -(position.positionAmount.safeConvertToInt256()),
                maxSlippage: 0,
                paymentType: TradingTypes.InnerPaymentType.NONE,
                networkFeeAmount: 0,
                data: abi.encode(position.account)
            })
        );

        _executeLiquidationOrder(keeper, orderId, tier, referralsRatio, referralUserRatio, referralOwner);

        emit ExecuteLiquidation(
            positionKey,
            position.account,
            position.pairIndex,
            position.isLong,
            position.collateral,
            position.positionAmount,
            price,
            orderId
        );
    }

    function _executeLiquidationOrder(
        address keeper,
        uint256 orderId,
        uint8 tier,
        uint256 referralsRatio,
        uint256 referralUserRatio,
        address referralOwner
    ) private {
        TradingTypes.DecreasePositionOrder memory order = orderManager.getDecreaseOrder(
            orderId,
            TradingTypes.TradeType.MARKET
        );
        if (order.account == address(0)) {
            emit InvalidOrder(keeper, orderId, 'zero account');
            return;
        }

        uint256 pairIndex = order.pairIndex;
        IPool.Pair memory pair = pool.getPair(pairIndex);

        Position.Info memory position = positionManager.getPosition(
            order.account,
            order.pairIndex,
            order.isLong
        );
        if (position.positionAmount == 0) {
            emit ZeroPosition(keeper, position.account, position.pairIndex, position.isLong, 'liquidation');
            return;
        }

        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(pairIndex);

        uint256 executionSize = order.sizeAmount - order.executedSize;
        executionSize = Math.min(executionSize, position.positionAmount);

        uint256 executionPrice = TradingHelper.getValidPrice(
            ADDRESS_PROVIDER,
            pair.indexToken,
            tradingConfig
        );

        (bool needADL, ) = positionManager.needADL(
            order.pairIndex,
            order.isLong,
            executionSize,
            executionPrice
        );
        if (needADL) {
            orderManager.setOrderNeedADL(orderId, order.tradeType, needADL);

            emit ExecuteDecreaseOrder(
                order.account,
                orderId,
                pairIndex,
                order.tradeType,
                order.isLong,
                order.collateral,
                order.sizeAmount,
                order.triggerPrice,
                executionSize,
                executionPrice,
                order.executedSize,
                needADL,
                0,
                0,
                0
            );
            return;
        }

        (uint256 tradingFee, int256 fundingFee, int256 pnl) = positionManager.decreasePosition(
            pairIndex,
            order.orderId,
            order.account,
            keeper,
            executionSize,
            order.isLong,
            0,
            feeCollector.getTradingFeeTier(pairIndex, tier),
            referralsRatio,
            referralUserRatio,
            referralOwner,
            executionPrice,
            true
        );

        // add executed size
        order.executedSize += executionSize;

        // remove order
        orderManager.removeDecreaseMarketOrders(orderId);

        emit ExecuteDecreaseOrder(
            order.account,
            orderId,
            pairIndex,
            order.tradeType,
            order.isLong,
            0,
            order.sizeAmount,
            order.triggerPrice,
            executionSize,
            executionPrice,
            order.executedSize,
            needADL,
            pnl,
            tradingFee,
            fundingFee
        );
    }

    function _needLiquidation(bytes32 positionKey, uint256 price) private view returns (bool) {
        Position.Info memory position = positionManager.getPositionByKey(positionKey);

        IPool.Pair memory pair = pool.getPair(position.pairIndex);
        IPool.TradingConfig memory tradingConfig = pool.getTradingConfig(position.pairIndex);

        int256 unrealizedPnl = position.getUnrealizedPnl(pair, position.positionAmount, price);
        uint256 tradingFee = positionManager.getTradingFee(
            position.pairIndex,
            position.isLong,
            position.positionAmount,
            price
        );
        int256 fundingFee = positionManager.getFundingFee(
            position.account,
            position.pairIndex,
            position.isLong
        );
        int256 exposureAsset = int256(position.collateral) +
            unrealizedPnl -
            int256(tradingFee) +
            fundingFee;

        bool need;
        if (exposureAsset <= 0) {
            need = true;
        } else {
            uint256 maintainMarginWad = uint256(
                TokenHelper.convertTokenAmountWithPrice(
                    pair.indexToken,
                    int256(position.positionAmount),
                    18,
                    position.averagePrice
                )
            ) * tradingConfig.maintainMarginRate;
            uint256 netAssetWad = uint256(
                TokenHelper.convertTokenAmountTo(pair.stableToken, exposureAsset, 18)
            );

            uint256 riskRate = maintainMarginWad / netAssetWad;
            need = riskRate >= PrecisionUtils.percentage();
        }
        return need;
    }
}
