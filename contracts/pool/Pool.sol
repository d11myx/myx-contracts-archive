// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/IPositionManager.sol";
import "../interfaces/IUniSwapV3Router.sol";
import "../interfaces/IPool.sol";
import "../interfaces/ISwapCallback.sol";
import "../interfaces/IPoolToken.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/ISpotSwap.sol";
import "../token/interfaces/IBaseToken.sol";
import "../interfaces/IWETH.sol";

import "../libraries/AmountMath.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Upgradeable.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/AMMUtils.sol";
import "../libraries/PrecisionUtils.sol";

import "../interfaces/IPoolTokenFactory.sol";
import "../interfaces/ILiquidityCallback.sol";
import "../helpers/ValidationHelper.sol";
import "../helpers/TokenHelper.sol";

contract Pool is IPool, Upgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;
    using Math for uint256;
    using SafeMath for uint256;

    uint256 private constant MAX_FEE = 1e6;

    IPoolTokenFactory public poolTokenFactory;

    address public riskReserve;
    address public feeCollector;

    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;

    mapping(address => mapping(address => uint256)) public override getPairIndex;
    // mapping(address => mapping(address => address)) public getPairToken;

    uint256 public pairsIndex;
    mapping(uint256 => Pair) public pairs;
    mapping(uint256 => Vault) public vaults;
    EnumerableSet.AddressSet private positionManagers;
    EnumerableSet.AddressSet private orderManagers;

    mapping(address => uint256) public feeTokenAmounts;
    mapping(address => bool) public isStableToken;
    address public spotSwap;

    function initialize(
        IAddressesProvider addressProvider,
        IPoolTokenFactory _poolTokenFactory
    ) public initializer {
        ADDRESS_PROVIDER = addressProvider;
        poolTokenFactory = _poolTokenFactory;
        pairsIndex = 1;
    }

    modifier transferAllowed() {
        require(
            positionManagers.contains(msg.sender) ||
                orderManagers.contains(msg.sender) ||
                riskReserve == msg.sender ||
                feeCollector == msg.sender,
            "permission denied"
        );
        _;
    }

    receive() external payable {
        require(msg.sender == ADDRESS_PROVIDER.WETH(), "Not WETH");
    }

    modifier onlyPositionManager() {
        require(positionManagers.contains(msg.sender), "onlyPositionManager");
        _;
    }

    modifier onlyPositionManagerOrFeeCollector() {
        require(
            positionManagers.contains(msg.sender) || msg.sender == feeCollector,
            "onlyPositionManagerOrFeeCollector"
        );
        _;
    }

    modifier onlyTreasury() {
        require(
            IRoleManager(ADDRESS_PROVIDER.roleManager()).isTreasurer(msg.sender),
            "onlyTreasury"
        );
        _;
    }

    function _unwrapWETH(uint256 amount, address payable to) private {
        IWETH(ADDRESS_PROVIDER.WETH()).withdraw(amount);
        (bool success, ) = to.call{value: amount}(new bytes(0));
        require(success, "err-transfer-eth");
    }

    function setSpotSwap(address _spotSwap) external onlyPoolAdmin {
        spotSwap = _spotSwap;
    }

    function setRiskReserve(address _riskReserve) external onlyPoolAdmin {
        riskReserve = _riskReserve;
    }

    function setFeeCollector(address _feeCollector) external onlyPoolAdmin {
        feeCollector = _feeCollector;
    }

    function addPositionManager(address _positionManager) external onlyPoolAdmin {
        positionManagers.add(_positionManager);
    }

    function removePositionManager(address _positionManager) external onlyPoolAdmin {
        positionManagers.remove(_positionManager);
    }

    function addOrderManager(address _orderManager) external onlyPoolAdmin {
        orderManagers.add(_orderManager);
    }

    function removeOrderManager(address _orderManager) external onlyPoolAdmin {
        orderManagers.remove(_orderManager);
    }

    function addStableToken(address _token) external onlyPoolAdmin {
        isStableToken[_token] = true;
    }

    function removeStableToken(address _token) external onlyPoolAdmin {
        delete isStableToken[_token];
    }

    // Manage pairs
    function addPair(address _indexToken, address _stableToken) external onlyPoolAdmin {
        require(_indexToken != address(0) && _stableToken != address(0), "zero address");
        require(isStableToken[_stableToken], "!stable token");
        require(getPairIndex[_indexToken][_stableToken] == 0, "exists");

        address pairToken = poolTokenFactory.createPoolToken(_indexToken, _stableToken);

        // getPairToken[_indexToken][_stableToken] = pairToken;
        getPairIndex[_indexToken][_stableToken] = pairsIndex;
        getPairIndex[_stableToken][_indexToken] = pairsIndex;

        Pair storage pair = pairs[pairsIndex];
        pair.pairIndex = pairsIndex;
        pair.indexToken = _indexToken;

        pair.stableToken = _stableToken;
        pair.pairToken = pairToken;

        emit PairAdded(_indexToken, _stableToken, pairToken, pairsIndex++);
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(
            pair.indexToken != address(0) && pair.stableToken != address(0),
            "pair not existed"
        );
        require(
            _pair.expectIndexTokenP <= PrecisionUtils.percentage() &&
                _pair.addLpFeeP <= PrecisionUtils.percentage(),
            "exceed 100%"
        );

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.expectIndexTokenP = _pair.expectIndexTokenP;
        pair.maxUnbalancedP = _pair.maxUnbalancedP;
        pair.unbalancedDiscountRate = _pair.unbalancedDiscountRate;
        pair.addLpFeeP = _pair.addLpFeeP;
        pair.removeLpFeeP = _pair.removeLpFeeP;
    }

    function updateTradingConfig(
        uint256 _pairIndex,
        TradingConfig calldata _tradingConfig
    ) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(
            pair.indexToken != address(0) && pair.stableToken != address(0),
            "pair not existed"
        );
        require(
            _tradingConfig.maintainMarginRate <= PrecisionUtils.percentage() &&
                _tradingConfig.priceSlipP <= PrecisionUtils.percentage() &&
                _tradingConfig.maxPriceDeviationP <= PrecisionUtils.percentage(),
            "exceed 100%"
        );
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(
        uint256 _pairIndex,
        TradingFeeConfig calldata _tradingFeeConfig
    ) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(
            pair.indexToken != address(0) && pair.stableToken != address(0),
            "pair not existed"
        );
        require(
            _tradingFeeConfig.takerFeeP <= MAX_FEE && _tradingFeeConfig.makerFeeP <= MAX_FEE,
            "trading fee exceed 1%"
        );
        require(
            _tradingFeeConfig.lpFeeDistributeP +
                _tradingFeeConfig.keeperFeeDistributeP +
                _tradingFeeConfig.stakingFeeDistributeP <=
                PrecisionUtils.percentage(),
            "distribute exceed 1%"
        );
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) public onlyPositionManager {
        _increaseTotalAmount(_pairIndex, _indexAmount, _stableAmount);
    }

    function _increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) internal {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
        emit UpdateTotalAmount(
            _pairIndex,
            int256(_indexAmount),
            int256(_stableAmount),
            vault.indexTotalAmount,
            vault.stableTotalAmount
        );
    }

    function decreaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) public onlyPositionManager {
        _decreaseTotalAmount(_pairIndex, _indexAmount, _stableAmount);
    }

    function _decreaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) internal {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
        emit UpdateTotalAmount(
            _pairIndex,
            -int256(_indexAmount),
            -int256(_stableAmount),
            vault.indexTotalAmount,
            vault.stableTotalAmount
        );
    }

    function increaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        vault.indexReservedAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount + _stableAmount;
        require(vault.indexTotalAmount >= vault.indexReservedAmount, "insufficient index amount");
        require(
            vault.stableTotalAmount >= vault.stableReservedAmount,
            "insufficient stable amount"
        );
        emit UpdateReserveAmount(
            _pairIndex,
            int256(_indexAmount),
            int256(_stableAmount),
            vault.indexReservedAmount,
            vault.stableReservedAmount
        );
    }

    function decreaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        require(vault.indexReservedAmount >= _indexAmount, "exceeds index amount");
        require(vault.stableReservedAmount >= _stableAmount, "exceeds stable amount");

        vault.indexReservedAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount - _stableAmount;
        emit UpdateReserveAmount(
            _pairIndex,
            -int256(_indexAmount),
            -int256(_stableAmount),
            vault.indexReservedAmount,
            vault.stableReservedAmount
        );
    }

    function updateAveragePrice(
        uint256 _pairIndex,
        uint256 _averagePrice
    ) external onlyPositionManager {
        vaults[_pairIndex].averagePrice = _averagePrice;
        emit UpdateAveragePrice(_pairIndex, _averagePrice);
    }

    function setLPStableProfit(
        uint256 _pairIndex,
        int256 _profit
    ) external onlyPositionManagerOrFeeCollector {
        Vault storage vault = vaults[_pairIndex];
        Pair memory pair = pairs[_pairIndex];
        if (_profit > 0) {
            vault.stableTotalAmount += _profit.abs();
        } else {
            if (vault.stableTotalAmount < _profit.abs()) {
                _swapInUni(_pairIndex, pair.indexToken, _profit.abs());
            }
            vault.stableTotalAmount -= _profit.abs();
        }

        emit UpdateLPProfit(_pairIndex, pair.stableToken, _profit, vault.stableTotalAmount);
    }

    function setLPIndexProfit(uint256 _pairIndex, int256 _profit) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        Pair memory pair = pairs[_pairIndex];
        if (_profit > 0) {
            vault.indexTotalAmount += _profit.abs();
        } else {
            if (vault.indexTotalAmount < _profit.abs()) {
                _swapInUni(_pairIndex, pair.stableToken, _profit.abs());
            }
            vault.indexTotalAmount -= _profit.abs();
        }

        emit UpdateLPProfit(_pairIndex, pair.indexToken, _profit, vault.indexTotalAmount);
    }

    function addLiquidity(
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, recipient);

        return _addLiquidity(recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function addLiquidityForAccount(
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, recipient);

        return _addLiquidity(recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function removeLiquidity(
        address payable _receiver,
        uint256 _pairIndex,
        uint256 _amount,
        bool useETH,
        bytes calldata data
    )
        external
        returns (uint256 receivedIndexAmount, uint256 receivedStableAmount, uint256 feeAmount)
    {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, _receiver);

        (receivedIndexAmount, receivedStableAmount, feeAmount) = _removeLiquidity(
            _receiver,
            _pairIndex,
            _amount,
            useETH,
            data
        );

        return (receivedIndexAmount, receivedStableAmount, feeAmount);
    }

    function _transferToken(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount,
        bytes calldata data
    ) internal {
        uint256 balanceIndexBefore;
        uint256 balanceStableBefore;
        if (indexAmount > 0) balanceIndexBefore = IERC20(indexToken).balanceOf(address(this));
        if (stableAmount > 0) balanceStableBefore = IERC20(stableToken).balanceOf(address(this));
        ILiquidityCallback(msg.sender).addLiquidityCallback(
            indexToken,
            stableToken,
            indexAmount,
            stableAmount,
            data
        );

        if (indexAmount > 0)
            require(
                balanceIndexBefore.add(indexAmount) <= IERC20(indexToken).balanceOf(address(this)),
                "ti"
            );
        if (stableAmount > 0) {
            require(
                balanceStableBefore.add(stableAmount) <=
                    IERC20(stableToken).balanceOf(address(this)),
                "ts"
            );
        }
    }

    function _swapInUni(uint256 _pairIndex, address tokenIn, uint256 expectAmountOut) private {
        Pair memory pair = pairs[_pairIndex];
        uint256 price = getPrice(pair.indexToken);
        uint256 amountInMaximum;
        address tokenOut;
        if (tokenIn == pair.indexToken) {
            tokenOut = pair.stableToken;
            amountInMaximum = (expectAmountOut * 12) / (price * 10);
        } else if (tokenIn == pair.stableToken) {
            tokenOut = pair.indexToken;
            amountInMaximum = (expectAmountOut * price * 12) / 10;
        }
        if (IERC20(tokenIn).allowance(address(this), spotSwap) == 0) {
            IERC20(tokenIn).safeApprove(spotSwap, type(uint256).max);
        }
        ISpotSwap(spotSwap).swap(tokenIn, tokenOut, amountInMaximum, expectAmountOut);
    }

    // calculate lp amount for add liquidity
    function getMintLpAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    )
        external
        view
        override
        returns (
            uint256 mintAmount,
            address slipToken,
            uint256 slipAmount,
            uint256 indexFeeAmount,
            uint256 stableFeeAmount,
            uint256 afterFeeIndexAmount,
            uint256 afterFeeStableAmount
        )
    {
        if (_indexAmount == 0 && _stableAmount == 0) return (0, address(0), 0, 0, 0, 0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPool.Vault memory vault = getVault(_pairIndex);

        // transfer fee
        indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
        stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);

        afterFeeIndexAmount = _indexAmount - indexFeeAmount;
        afterFeeStableAmount = _stableAmount - stableFeeAmount;

        // usdt value of reserve
        uint256 price = getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = AmountMath.getStableDelta(
            _getIndexTotalAmount(pair, vault),
            price
        );

        // usdt value of deposit
        uint256 indexDepositDelta = AmountMath.getStableDelta(afterFeeIndexAmount, price);

        // calculate deposit usdt value without slippage
        uint256 slipDelta;
        uint256 stableTotalAmount = _getStableTotalAmount(pair, vault);
        uint256 availableDiscountRate;
        uint256 availableDiscountAmount;
        if (indexReserveDelta + stableTotalAmount > 0) {
            // after deposit
            uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
            uint256 stableTotalDelta = stableTotalAmount + afterFeeStableAmount;

            // expect delta
            uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
            uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
            uint256 expectStableDelta = totalDelta - expectIndexDelta;

            if (_indexAmount > 0 && _stableAmount == 0) {
                uint256 currentIndexRatio = indexTotalDelta.divPercentage(totalDelta);
                int256 indexUnbalanced = int256(
                    currentIndexRatio.divPercentage(pair.expectIndexTokenP)
                ) - int256(PrecisionUtils.percentage());
                if (indexUnbalanced < 0 && indexUnbalanced.abs() > pair.maxUnbalancedP) {
                    availableDiscountRate = pair.unbalancedDiscountRate;
                    availableDiscountAmount = expectIndexDelta.sub(indexTotalDelta);
                }
            }

            if (_stableAmount > 0 && _indexAmount == 0) {
                uint256 currentStableRatio = stableTotalDelta.divPercentage(totalDelta);
                int256 stableUnbalanced = int256(
                    currentStableRatio.divPercentage(
                        PrecisionUtils.percentage().sub(pair.expectIndexTokenP)
                    )
                ) - int256(PrecisionUtils.percentage());
                if (stableUnbalanced < 0 && stableUnbalanced.abs() > pair.maxUnbalancedP) {
                    availableDiscountRate = pair.unbalancedDiscountRate;
                    availableDiscountAmount = expectStableDelta.sub(stableTotalDelta);
                }
            }

            (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(
                pair.kOfSwap,
                price,
                AmountMath.PRICE_PRECISION
            );
            if (indexTotalDelta > expectIndexDelta) {
                uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                    ? (indexDepositDelta - needSwapIndexDelta)
                    : indexDepositDelta;

                slipDelta =
                    swapIndexDelta -
                    AMMUtils.getAmountOut(
                        AmountMath.getIndexAmount(swapIndexDelta, price),
                        reserveA,
                        reserveB
                    );
                slipToken = pair.indexToken;
                slipAmount = AmountMath.getIndexAmount(slipDelta, price);

                afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
            } else if (stableTotalDelta > expectStableDelta) {
                uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                    ? (afterFeeStableAmount - needSwapStableDelta)
                    : afterFeeStableAmount;

                slipDelta =
                    swapStableDelta -
                    AmountMath.getStableDelta(
                        AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA),
                        price
                    );
                slipToken = pair.stableToken;
                slipAmount = slipDelta;

                afterFeeStableAmount = afterFeeStableAmount - slipDelta;
            }
        }
        uint256 mintDelta;
        if (slipToken == pair.indexToken) {
            mintDelta = indexDepositDelta + uint256(TokenHelper.convertStableAmountToIndex(pair, int256(afterFeeStableAmount))) - slipDelta;
        } else if (slipToken == pair.stableToken) {
            mintDelta = indexDepositDelta + uint256(TokenHelper.convertStableAmountToIndex(pair, int256(afterFeeStableAmount - slipDelta)));
        } else {
            mintDelta = indexDepositDelta + uint256(TokenHelper.convertStableAmountToIndex(pair, int256(afterFeeStableAmount)));
        }

        // mint with discount
        if (availableDiscountRate > 0) {
            if (mintDelta > availableDiscountAmount) {
                mintAmount += AmountMath.getIndexAmount(
                    availableDiscountAmount,
                    lpFairPrice(_pairIndex).mulPercentage(
                        PrecisionUtils.percentage() - availableDiscountRate
                    )
                );
                mintDelta -= availableDiscountAmount;
            } else {
                mintAmount += AmountMath.getIndexAmount(
                    mintDelta,
                    lpFairPrice(_pairIndex).mulPercentage(
                        PrecisionUtils.percentage() - availableDiscountRate
                    )
                );
                mintDelta -= mintDelta;
            }
        }

        if (mintDelta > 0) {
            uint8 indexDec = IERC20Metadata(pair.indexToken).decimals();
            mintAmount += AmountMath.getIndexAmount(mintDelta * (10 ** (18 - indexDec)), lpFairPrice(_pairIndex));
        }

        return (
            mintAmount,
            slipToken,
            slipAmount,
            indexFeeAmount,
            stableFeeAmount,
            afterFeeIndexAmount,
            afterFeeStableAmount
        );
    }

    function _getStableTotalAmount(
        IPool.Pair memory pair,
        IPool.Vault memory vault
    ) internal view returns (uint256) {
        int256 profit = getProfit(pair.pairIndex, pair.stableToken);
        if (profit < 0) {
            return vault.stableTotalAmount.sub(profit.abs());
        } else {
            return vault.stableTotalAmount.add(profit.abs());
        }
    }

    function _getIndexTotalAmount(
        IPool.Pair memory pair,
        IPool.Vault memory vault
    ) internal view returns (uint256) {
        int256 profit = getProfit(pair.pairIndex, pair.indexToken);
        if (profit < 0) {
            return vault.indexTotalAmount.sub(profit.abs());
        } else {
            return vault.indexTotalAmount.add(profit.abs());
        }
    }

    function _addLiquidity(
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) private returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, "invalid amount");

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        uint256 indexFeeAmount;
        uint256 stableFeeAmount;
        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;
        _transferToken(pair.indexToken, pair.stableToken, _indexAmount, _stableAmount, data);

        (
            mintAmount,
            slipToken,
            slipAmount,
            indexFeeAmount,
            stableFeeAmount,
            afterFeeIndexAmount,
            afterFeeStableAmount
        ) = this.getMintLpAmount(_pairIndex, _indexAmount, _stableAmount);

        feeTokenAmounts[pair.indexToken] += indexFeeAmount;
        feeTokenAmounts[pair.stableToken] += stableFeeAmount;

        IBaseToken(pair.pairToken).mint(recipient, mintAmount);

        _increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        emit AddLiquidity(
            msg.sender,
            recipient,
            _pairIndex,
            _indexAmount,
            _stableAmount,
            mintAmount,
            indexFeeAmount,
            stableFeeAmount,
            slipToken,
            slipAmount
        );

        return (mintAmount, slipToken, slipAmount);
    }

    function _removeLiquidity(
        address payable _receiver,
        uint256 _pairIndex,
        uint256 _amount,
        bool useETH,
        bytes calldata data
    )
        private
        returns (
            uint256 receiveIndexTokenAmount,
            uint256 receiveStableTokenAmount,
            uint256 feeAmount
        )
    {
        require(_amount > 0, "invalid amount");
        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        uint256 feeIndexTokenAmount;
        uint256 feeStableTokenAmount;
        (
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            feeAmount,
            feeIndexTokenAmount,
            feeStableTokenAmount
        ) = getReceivedAmount(_pairIndex, _amount);

        IPool.Vault memory vault = getVault(_pairIndex);
        uint256 price = getPrice(pair.indexToken);
        uint256 indexTokenDec = IERC20Metadata(pair.indexToken).decimals();
        uint256 stableTokenDec = IERC20Metadata(pair.stableToken).decimals();

        uint256 availableIndexToken = vault.indexTotalAmount - vault.indexReservedAmount;
        uint256 availableIndexTokenWad = availableIndexToken * (10 ** (18 - indexTokenDec));

        uint256 availableStableToken = vault.stableTotalAmount - vault.stableReservedAmount;
        uint256 availableStableTokenWad = availableStableToken * (10 ** (18 - stableTokenDec));

        uint256 receiveIndexTokenAmountWad = receiveIndexTokenAmount * (10 ** (18 - indexTokenDec));
        uint256 receiveStableTokenAmountWad = receiveStableTokenAmount * (10 ** (18 - stableTokenDec));

        uint256 totalAvailable = availableIndexTokenWad.mulPrice(price) + availableStableTokenWad;
        uint256 totalReceive = receiveIndexTokenAmountWad.mulPrice(price) + receiveStableTokenAmountWad;
        require(totalReceive <= totalAvailable, "insufficient available balance");

        _decreaseTotalAmount(_pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount);

        ILiquidityCallback(msg.sender).removeLiquidityCallback(pair.pairToken, _amount, data);
        IPoolToken(pair.pairToken).burn(_amount);

        if (useETH && pair.indexToken == ADDRESS_PROVIDER.WETH()) {
            _unwrapWETH(receiveIndexTokenAmount, _receiver);
        } else {
            IERC20(pair.indexToken).safeTransfer(_receiver, receiveIndexTokenAmount);
        }

        IERC20(pair.stableToken).safeTransfer(_receiver, receiveStableTokenAmount);

        feeTokenAmounts[pair.indexToken] += feeIndexTokenAmount;
        feeTokenAmounts[pair.stableToken] += feeStableTokenAmount;

        emit RemoveLiquidity(
            msg.sender,
            _receiver,
            _pairIndex,
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            _amount,
            feeAmount
        );

        return (receiveIndexTokenAmount, receiveStableTokenAmount, feeAmount);
    }

    function claimFee(address token, uint256 amount) external onlyTreasury {
        require(feeTokenAmounts[token] >= amount, "exceeded");

        feeTokenAmounts[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit ClaimedFee(msg.sender, token, amount);
    }

    function lpFairPrice(uint256 _pairIndex) public view returns (uint256) {
        IPool.Pair memory pair = getPair(_pairIndex);
        IPool.Vault memory vault = getVault(_pairIndex);
        uint256 price = getPrice(pair.indexToken);

        uint256 indexTokenDec = IERC20Metadata(pair.indexToken).decimals();
        uint256 stableTokenDec = IERC20Metadata(pair.stableToken).decimals();

        uint256 indexTotalAmountWad = _getIndexTotalAmount(pair, vault) * (10 ** (18 - indexTokenDec));
        uint256 stableTotalAmountWad = _getStableTotalAmount(pair, vault) * (10 ** (18 - stableTokenDec));

        uint256 lpFairDelta = AmountMath.getStableDelta(indexTotalAmountWad, price) + stableTotalAmountWad;

        return
            lpFairDelta > 0 && IERC20(pair.pairToken).totalSupply() > 0
                ? Math.mulDiv(
                    lpFairDelta,
                    AmountMath.PRICE_PRECISION,
                    IERC20(pair.pairToken).totalSupply()
                )
                : 1 * AmountMath.PRICE_PRECISION;
    }

    // calculate deposit amount for add liquidity
    function getDepositAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    ) external view returns (uint256 depositIndexAmount, uint256 depositStableAmount) {
        if (_lpAmount == 0) return (0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPool.Vault memory vault = getVault(_pairIndex);

        uint256 price = getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexReserveDeltaWad = uint256(TokenHelper.convertTokenAmountWithPrice(
            pair.indexToken,
            int256(vault.indexTotalAmount),
            18,
            price
        ));
        uint256 stableReserveDeltaWad = uint256(TokenHelper.convertTokenAmountTo(
            pair.stableToken,
            int256(vault.stableTotalAmount),
            18
        ));
        uint256 depositDeltaWad = uint256(TokenHelper.convertTokenAmountWithPrice(
            pair.pairToken,
            int256(_lpAmount),
            18,
            lpFairPrice(_pairIndex)
        ));

        // expect delta
        uint256 totalDelta = (indexReserveDeltaWad + stableReserveDeltaWad + depositDeltaWad);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;

        uint256 depositIndexTokenDelta;
        uint256 depositStableTokenDelta;
        if (expectIndexDelta >= indexReserveDeltaWad) {
            uint256 extraIndexReserveDelta = expectIndexDelta - indexReserveDeltaWad;
            if (extraIndexReserveDelta >= depositDeltaWad) {
                depositIndexTokenDelta = depositDeltaWad;
            } else {
                depositIndexTokenDelta = extraIndexReserveDelta;
                depositStableTokenDelta = depositDeltaWad - extraIndexReserveDelta;
            }
        } else {
            uint256 extraStableReserveDelta = expectStableDelta - stableReserveDeltaWad;
            if (extraStableReserveDelta >= depositDeltaWad) {
                depositStableTokenDelta = depositDeltaWad;
            } else {
                depositIndexTokenDelta = depositDeltaWad - extraStableReserveDelta;
                depositStableTokenDelta = extraStableReserveDelta;
            }
        }
        uint256 indexTokenDec = uint256(IERC20Metadata(pair.indexToken).decimals());
        uint256 stableTokenDec = uint256(IERC20Metadata(pair.stableToken).decimals());

        depositIndexAmount = depositIndexTokenDelta * PrecisionUtils.pricePrecision() / price / (10 ** (18 - indexTokenDec));
        depositStableAmount = depositStableTokenDelta / (10 ** (18 - stableTokenDec));

        // add fee
        depositIndexAmount = depositIndexAmount.divPercentage(
            PrecisionUtils.percentage() - pair.addLpFeeP
        );
        depositStableAmount = depositStableAmount.divPercentage(
            PrecisionUtils.percentage() - pair.addLpFeeP
        );

        return (depositIndexAmount, depositStableAmount);
    }

    // calculate amount for remove liquidity
    function getReceivedAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    )
        public
        view
        returns (
            uint256 receiveIndexTokenAmount,
            uint256 receiveStableTokenAmount,
            uint256 feeAmount,
            uint256 feeIndexTokenAmount,
            uint256 feeStableTokenAmount
        )
    {
        if (_lpAmount == 0) return (0, 0, 0, 0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPool.Vault memory vault = getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexTokenDec = IERC20Metadata(pair.indexToken).decimals();
        uint256 stableTokenDec = IERC20Metadata(pair.stableToken).decimals();

        uint256 indexReserveDeltaWad = uint256(TokenHelper.convertTokenAmountWithPrice(
            pair.indexToken,
            int256(vault.indexTotalAmount),
            18,
            price));
        uint256 stableReserveDeltaWad = uint256(TokenHelper.convertTokenAmountTo(
            pair.stableToken,
            int256(vault.stableTotalAmount),
            18));
        uint256 receiveDeltaWad = uint256(TokenHelper.convertTokenAmountWithPrice(
            pair.pairToken,
            int256(_lpAmount),
            18,
            lpFairPrice(_pairIndex)));

        require(indexReserveDeltaWad + stableReserveDeltaWad >= receiveDeltaWad, "insufficient available balance");

        // expect delta
        uint256 totalDeltaWad = indexReserveDeltaWad + stableReserveDeltaWad - receiveDeltaWad;
        uint256 expectIndexDeltaWad = totalDeltaWad.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDeltaWad = totalDeltaWad - expectIndexDeltaWad;

        // received delta of indexToken and stableToken
        uint256 receiveIndexTokenDeltaWad;
        uint256 receiveStableTokenDeltaWad;
        if (indexReserveDeltaWad > expectIndexDeltaWad) {
            uint256 extraIndexReserveDelta = indexReserveDeltaWad - expectIndexDeltaWad;
            if (extraIndexReserveDelta >= receiveDeltaWad) {
                receiveIndexTokenDeltaWad = receiveDeltaWad;
            } else {
                receiveIndexTokenDeltaWad = extraIndexReserveDelta;
                receiveStableTokenDeltaWad = receiveDeltaWad - extraIndexReserveDelta;
            }
        } else {
            uint256 extraStableReserveDelta = stableReserveDeltaWad - expectStableDeltaWad;
            if (extraStableReserveDelta >= receiveDeltaWad) {
                receiveStableTokenDeltaWad = receiveDeltaWad;
            } else {
                receiveIndexTokenDeltaWad = receiveDeltaWad - extraStableReserveDelta;
                receiveStableTokenDeltaWad = extraStableReserveDelta;
            }
        }
        receiveIndexTokenAmount = AmountMath.getIndexAmount(receiveIndexTokenDeltaWad, price) / (10 ** (18 - indexTokenDec));
        receiveStableTokenAmount = receiveStableTokenDeltaWad / (10 ** (18 - stableTokenDec));

        feeIndexTokenAmount = receiveIndexTokenAmount.mulPercentage(pair.removeLpFeeP);
        feeStableTokenAmount = receiveStableTokenAmount.mulPercentage(pair.removeLpFeeP);
        feeAmount = uint256(TokenHelper.convertIndexAmountToStableWithPrice(pair, int256(feeIndexTokenAmount), price)) + feeStableTokenAmount;

        receiveIndexTokenAmount -= feeIndexTokenAmount;
        receiveStableTokenAmount -= feeStableTokenAmount;

        uint256 availableIndexToken = vault.indexTotalAmount - vault.indexReservedAmount;
        uint256 availableStableToken = vault.stableTotalAmount - vault.stableReservedAmount;

        uint256 indexTokenAdd;
        uint256 stableTokenAdd;
        if (availableIndexToken < receiveIndexTokenAmount) {
            stableTokenAdd = uint256(TokenHelper.convertIndexAmountToStableWithPrice(
                pair,
                int256(receiveIndexTokenAmount - availableIndexToken),
                price));
            receiveIndexTokenAmount = availableIndexToken;
        }

        if (availableStableToken < receiveStableTokenAmount) {
            indexTokenAdd = uint256(TokenHelper.convertStableAmountToIndex(
                pair,
                int256(receiveStableTokenAmount - availableStableToken)
            )).divPrice(price);
            receiveStableTokenAmount = availableStableToken;
        }
        receiveIndexTokenAmount += indexTokenAdd;
        receiveStableTokenAmount += stableTokenAdd;

        return (
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            feeAmount,
            feeIndexTokenAmount,
            feeStableTokenAmount
        );
    }

    function transferTokenTo(address token, address to, uint256 amount) external transferAllowed {
        require(IERC20(token).balanceOf(address(this)) > amount, "bal");
        IERC20(token).safeTransfer(to, amount);
    }

    function transferTokenOrSwap(
        uint256 pairIndex,
        address token,
        address to,
        uint256 amount
    ) external transferAllowed {
        if (amount == 0) {
            return;
        }
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < amount) {
            _swapInUni(pairIndex, token, amount);
        }
        IERC20(token).safeTransfer(to, amount);
    }

    function getProfit(uint pairIndex, address token) public view returns (int256 profit) {
        for (uint256 i = 0; i < positionManagersLength(); i++) {
            profit = profit + IPositionManager(positionManagers.at(i)).lpProfit(pairIndex, token);
        }
        return profit;
    }

    function getVault(uint256 _pairIndex) public view returns (Vault memory vault) {
        return vaults[_pairIndex];
    }

    function getPrice(address _token) public view returns (uint256) {
        return IPriceFeed(ADDRESS_PROVIDER.priceOracle()).getPrice(_token);
    }

    function getPair(uint256 _pairIndex) public view override returns (Pair memory) {
        return pairs[_pairIndex];
    }

    function getTradingConfig(
        uint256 _pairIndex
    ) external view override returns (TradingConfig memory) {
        return tradingConfigs[_pairIndex];
    }

    function getTradingFeeConfig(
        uint256 _pairIndex
    ) external view override returns (TradingFeeConfig memory) {
        return tradingFeeConfigs[_pairIndex];
    }

    // function getFundingFeeConfig(uint256 _pairIndex) external view override returns (FundingFeeConfig memory) {
    //     return fundingFeeConfigs[_pairIndex];
    // }

    function positionManagersAt(uint256 index) external view returns (address) {
        return positionManagers.at(index);
    }

    function positionManagersLength() public view returns (uint256) {
        return positionManagers.length();
    }

    function orderManagersLength() public view returns (uint256) {
        return orderManagers.length();
    }
}
