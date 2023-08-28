// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IPool.sol';
import '../interfaces/ISwapCallback.sol';
import '../interfaces/IPoolToken.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../token/interfaces/IBaseToken.sol';

import '../libraries/AmountMath.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Roleable.sol';
import '../libraries/Int256Utils.sol';
import '../libraries/AMMUtils.sol';
import '../libraries/PrecisionUtils.sol';

import '../interfaces/IPoolTokenFactory.sol';
import '../interfaces/ILiquidityCallback.sol';
import '../helpers/ValidationHelper.sol';
import 'hardhat/console.sol';

contract Pool is IPool, Roleable {
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;
    using Math for uint256;
    using SafeMath for uint256;

    IPoolTokenFactory public immutable poolTokenFactory;

    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;
    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;

    mapping(address => mapping(address => uint256)) public override getPairIndex;
    mapping(address => mapping(address => bool)) public isPairListed;

    uint256 public pairsCount;
    mapping(uint256 => Pair) public pairs;
    mapping(uint256 => Vault) public vaults;
    address public positionManager;
    address public orderManager;

    mapping(address => uint256) public feeTokenAmounts;

    constructor(IAddressesProvider addressProvider, IPoolTokenFactory _poolTokenFactory) Roleable(addressProvider) {
        poolTokenFactory = _poolTokenFactory;
    }

    modifier onlyPositionManagerOrOrderManager() {
        require(msg.sender == positionManager || msg.sender == orderManager, 'onlyPositionManagerOrOrderManager');
        _;
    }

    modifier onlyPositionManager() {
        require(msg.sender == positionManager, 'forbidden');
        _;
    }

    function setPositionManager(address _positionManager) external onlyPoolAdmin {
        positionManager = _positionManager;
    }

    function setOrderManager(address _orderManager) external onlyPoolAdmin {
        orderManager = _orderManager;
    }

    // Manage pairs
    function addPair(address _indexToken, address _stableToken) external onlyPoolAdmin {
        require(_indexToken != _stableToken, 'identical address');
        require(_indexToken != address(0) && _stableToken != address(0), 'zero address');
        require(!isPairListed[_indexToken][_stableToken], 'pair already listed');

        address pairToken = poolTokenFactory.createPoolToken(_indexToken, _stableToken);

        isPairListed[_indexToken][_stableToken] = true;
        getPairIndex[_indexToken][_stableToken] = pairsCount;

        Pair storage pair = pairs[pairsCount];
        pair.pairIndex = pairsCount;
        pair.indexToken = _indexToken;
        pair.stableToken = _stableToken;
        pair.pairToken = pairToken;

        emit PairAdded(_indexToken, _stableToken, pairToken, pairsCount++);
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');
        require(
            _pair.expectIndexTokenP <= PrecisionUtils.percentage() && _pair.addLpFeeP <= PrecisionUtils.percentage(),
            'exceed 100%'
        );

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.expectIndexTokenP = _pair.expectIndexTokenP;
        pair.addLpFeeP = _pair.addLpFeeP;
    }

    function updateTradingConfig(uint256 _pairIndex, TradingConfig calldata _tradingConfig) external onlyPoolAdmin {
        require(
            _tradingConfig.maintainMarginRate <= PrecisionUtils.percentage() &&
                _tradingConfig.priceSlipP <= PrecisionUtils.percentage() &&
                _tradingConfig.maxPriceDeviationP <= PrecisionUtils.percentage(),
            'exceed 100%'
        );
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(
        uint256 _pairIndex,
        TradingFeeConfig calldata _tradingFeeConfig
    ) external onlyPoolAdmin {
        require(
            _tradingFeeConfig.takerFeeP <= PrecisionUtils.percentage() &&
                _tradingFeeConfig.makerFeeP <= PrecisionUtils.percentage(),
            'trading fee exceed 100%'
        );
        require(
            _tradingFeeConfig.lpFeeDistributeP +
                _tradingFeeConfig.keeperFeeDistributeP +
                _tradingFeeConfig.stakingFeeDistributeP <=
                PrecisionUtils.percentage(),
            'distribute exceed 100%'
        );
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function updateFundingFeeConfig(
        uint256 _pairIndex,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyPoolAdmin {
        require(
            _fundingFeeConfig.fundingWeightFactor <= PrecisionUtils.percentage() &&
                _fundingFeeConfig.liquidityPremiumFactor <= PrecisionUtils.percentage(),
            'exceed 100%'
        );

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function updatePairMiner(uint256 _pairIndex, address _account, bool _enable) external onlyPoolAdmin {
        Pair memory pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');

        IBaseToken(pair.pairToken).setMiner(_account, _enable);
    }

    function increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) public onlyPositionManager {
        _increaseTotalAmount(_pairIndex, _indexAmount, _stableAmount);
    }

    function _increaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) internal {
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

    function _decreaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) internal {
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

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external onlyPositionManager {
        vaults[_pairIndex].averagePrice = _averagePrice;
        emit UpdateAveragePrice(_pairIndex, _averagePrice);
    }

    function increaseLPProfit(uint256 _pairIndex, uint256 _profit) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        vault.stableTotalAmount += _profit;

        emit UpdateLPProfit(_pairIndex, int256(_profit), vault.stableTotalAmount);
    }

    function decreaseLPProfit(uint256 _pairIndex, uint256 _profit) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;
        require(_profit <= availableStable, 'stable token not enough');
        vault.stableTotalAmount -= _profit;
        emit UpdateLPProfit(_pairIndex, -int256(_profit), vault.stableTotalAmount);
    }

    function liqiitySwap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _amountOut
    ) public onlyPositionManager {
        Vault memory vault = vaults[_pairIndex];

        if (_isBuy) {
            uint256 availableIndex = vault.indexTotalAmount - vault.indexReservedAmount;

            require(_amountOut <= availableIndex, 'swap index token not enough');

            _increaseTotalAmount(_pairIndex, 0, _amountIn);
            _decreaseTotalAmount(_pairIndex, _amountOut, 0);
        } else {
            uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

            require(_amountOut <= availableStable, 'swap stable token not enough');

            _increaseTotalAmount(_pairIndex, _amountIn, 0);
            _decreaseTotalAmount(_pairIndex, 0, _amountOut);
        }
    }

    function addLiquidity(
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, recipient);

        return _addLiquidity(msg.sender, recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function addLiquidityForAccount(
        address _funder,
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, recipient);

        return _addLiquidity(_funder, recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function removeLiquidity(
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount,
        bytes calldata data
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, _receiver);

        (receivedIndexAmount, receivedStableAmount) = _removeLiquidity(_receiver, _pairIndex, _amount, data);

        IPool.Pair memory pair = getPair(_pairIndex);
        if (receivedStableAmount > 0) {
            IERC20(pair.stableToken).transfer(msg.sender, receivedStableAmount);
        }
        return (receivedIndexAmount, receivedStableAmount);
    }

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut,
        bytes calldata data
    ) external returns (uint256 amountIn, uint256 amountOut) {
        (amountIn, amountOut) = _swap(msg.sender, address(this), _pairIndex, _isBuy, _amountIn, _minOut, data);
        return (amountIn, amountOut);
    }

    function swapForAccount(
        address _funder,
        address _receiver,
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut,
        bytes calldata data
    ) external returns (uint256 amountIn, uint256 amountOut) {
        return _swap(_funder, _receiver, _pairIndex, _isBuy, _amountIn, _minOut, data);
    }

    function _swap(
        address _funder,
        address _receiver,
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut,
        bytes calldata data
    ) internal returns (uint256 amountIn, uint256 amountOut) {
        require(_amountIn > 0, 'swap invalid amount in');

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'swap invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);

        uint256 price = _getPrice(pair.indexToken);

        // total delta
        uint256 indexTotalDelta = vault.indexTotalAmount.mulPrice(price);
        uint256 stableTotalDelta = vault.stableTotalAmount;

        uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;

        uint256 balanceBefore;

        if (_isBuy) {
            // index out stable in
            require(expectStableDelta > stableTotalDelta, 'no need stable token');

            uint256 stableInDelta = _amountIn;
            stableInDelta = stableInDelta.min(expectStableDelta - stableTotalDelta);

            amountOut = stableInDelta.divPrice(price);
            uint256 availableIndex = vault.indexTotalAmount - vault.indexReservedAmount;

            require(availableIndex > 0, 'no available index token');

            amountOut = amountOut.min(availableIndex);
            amountIn = amountOut.divPrice(price);

            require(amountOut >= _minOut, 'insufficient minOut');

            liqiitySwap(_pairIndex, _isBuy, amountIn, amountOut);
            if (amountIn > 0) balanceBefore = IERC20(pair.stableToken).balanceOf(address(this));
            ISwapCallback(msg.sender).swapCallback(pair.stableToken, pair.stableToken, 0, amountIn, data);
            if (amountIn > 0) {
                require(balanceBefore.add(amountIn) <= IERC20(pair.stableToken).balanceOf(address(this)), 'ti');
            }
            IERC20(pair.indexToken).safeTransfer(_receiver, amountOut);
        } else {
            // index in stable out
            require(expectIndexDelta > indexTotalDelta, 'no need index token');

            uint256 indexInDelta = _amountIn.mulPrice(price);
            indexInDelta = indexInDelta.min(expectIndexDelta - indexTotalDelta);

            amountOut = indexInDelta;
            uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

            require(availableStable > 0, 'no stable token');

            amountOut = amountOut.min(availableStable);
            amountIn = amountOut.divPrice(price);
            if (amountIn > 0) balanceBefore = IERC20(pair.indexToken).balanceOf(address(this));
            ISwapCallback(msg.sender).swapCallback(pair.indexToken, pair.stableToken, amountIn, 0, data);
            if (amountIn > 0) {
                require(balanceBefore.add(amountIn) <= IERC20(pair.indexToken).balanceOf(address(this)), 't');
            }
            IERC20(pair.stableToken).safeTransfer(_receiver, amountOut);
        }

        emit Swap(_funder, _receiver, _pairIndex, _isBuy, amountIn, amountOut);
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
        ILiquidityCallback(msg.sender).addLiquidityCallback(indexToken, stableToken, indexAmount, stableAmount, data);

        if (indexAmount > 0)
            require(balanceIndexBefore.add(indexAmount) <= IERC20(indexToken).balanceOf(address(this)), 'ti');
        if (stableAmount > 0) {
            require(balanceStableBefore.add(stableAmount) <= IERC20(stableToken).balanceOf(address(this)), 'ts');
        }
    }

    function _addLiquidity(
        address _account,
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) private returns (uint256 mintAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, 'invalid amount');

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);
        _transferToken(pair.indexToken, pair.stableToken, _indexAmount, _stableAmount, data);

        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        // transfer fee
        uint256 indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
        uint256 stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);

        feeTokenAmounts[pair.indexToken] = feeTokenAmounts[pair.indexToken].add(indexFeeAmount);

        feeTokenAmounts[pair.stableToken] = feeTokenAmounts[pair.stableToken].add(stableFeeAmount);

        afterFeeIndexAmount = _indexAmount - indexFeeAmount;
        afterFeeStableAmount = _stableAmount - stableFeeAmount;

        // usdt value of reserve
        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        uint256 indexReserveDelta = AmountMath.getStableDelta(vault.indexTotalAmount, price);

        // usdt value of deposit
        uint256 indexDepositDelta = AmountMath.getStableDelta(afterFeeIndexAmount, price);

        // calculate deposit usdt value without slippage
        uint256 slipDelta;
        address slipToken;
        uint256 slipAmount;
        if (indexReserveDelta + vault.stableTotalAmount > 0) {
            // after deposit
            uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
            uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;

            // expect delta
            uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
            uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
            uint256 expectStableDelta = totalDelta - expectIndexDelta;

            (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, AmountMath.PRICE_PRECISION);
            if (indexTotalDelta > expectIndexDelta) {
                uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                    ? (indexDepositDelta - needSwapIndexDelta)
                    : indexDepositDelta;

                slipDelta =
                    swapIndexDelta -
                    AMMUtils.getAmountOut(AmountMath.getIndexAmount(swapIndexDelta, price), reserveA, reserveB);
                slipToken = pair.indexToken;
                slipAmount = AmountMath.getIndexAmount(slipDelta, price);

                afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                feeTokenAmounts[pair.indexToken] = feeTokenAmounts[pair.indexToken].add(slipAmount);
            } else if (stableTotalDelta > expectStableDelta) {
                uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                    ? (afterFeeStableAmount - needSwapStableDelta)
                    : afterFeeStableAmount;

                slipDelta =
                    swapStableDelta -
                    AmountMath.getStableDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);
                slipToken = pair.stableToken;
                slipAmount = slipDelta;

                afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                feeTokenAmounts[pair.stableToken] = feeTokenAmounts[pair.stableToken].add(slipDelta);
            }
        }
        // mint lp
        mintAmount = AmountMath.getIndexAmount(
            indexDepositDelta + afterFeeStableAmount - slipDelta,
            lpFairPrice(_pairIndex)
        );
        IBaseToken(pair.pairToken).mint(recipient, mintAmount);

        _increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        emit AddLiquidity(
            recipient,
            _account,
            _pairIndex,
            _indexAmount,
            _stableAmount,
            mintAmount,
            indexFeeAmount,
            stableFeeAmount,
            slipToken,
            slipAmount
        );

        return mintAmount;
    }

    function _removeLiquidity(
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount,
        bytes calldata data
    ) private returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_amount > 0, 'invalid amount');
        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);

        (receiveIndexTokenAmount, receiveStableTokenAmount) = getReceivedAmount(_pairIndex, _amount);

        require(
            receiveIndexTokenAmount <= vault.indexTotalAmount - vault.indexReservedAmount,
            'insufficient indexToken amount'
        );
        require(
            receiveStableTokenAmount <= vault.stableTotalAmount - vault.stableReservedAmount,
            'insufficient stableToken amount'
        );

        _decreaseTotalAmount(_pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount);
        ILiquidityCallback(msg.sender).removeLiquidityCallback(pair.pairToken, _amount, data);
        IPoolToken(pair.pairToken).burn(_amount);
        IERC20(pair.indexToken).safeTransfer(_receiver, receiveIndexTokenAmount);
        IERC20(pair.stableToken).safeTransfer(_receiver, receiveStableTokenAmount);

        emit RemoveLiquidity(
            msg.sender,
            _receiver,
            _pairIndex,
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            _amount
        );

        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function lpFairPrice(uint256 _pairIndex) public view returns (uint256) {
        IPool.Pair memory pair = getPair(_pairIndex);
        IPool.Vault memory vault = getVault(_pairIndex);
        uint256 price = _getPrice(pair.indexToken);
        uint256 lpFairDelta = AmountMath.getStableDelta(vault.indexTotalAmount, price) + vault.stableTotalAmount;
        return
            lpFairDelta > 0
                ? Math.mulDiv(lpFairDelta, AmountMath.PRICE_PRECISION, IERC20(pair.pairToken).totalSupply())
                : 1 * AmountMath.PRICE_PRECISION;
    }

    // calculate deposit amount for add liquidity
    function getDepositAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    ) external view returns (uint256 depositIndexAmount, uint256 depositStableAmount) {
        if (_lpAmount == 0) return (0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);

        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        uint256 indexReserveDelta = AmountMath.getStableDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;
        uint256 depositDelta = AmountMath.getStableDelta(_lpAmount, lpFairPrice(_pairIndex));

        // expect delta
        uint256 totalDelta = (indexReserveDelta + stableReserveDelta + depositDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;

        uint256 depositIndexTokenDelta;
        uint256 depositStableTokenDelta;

        if (expectIndexDelta >= indexReserveDelta) {
            uint256 extraIndexReserveDelta = expectIndexDelta - indexReserveDelta;
            if (extraIndexReserveDelta >= depositDelta) {
                depositIndexTokenDelta = depositDelta;
            } else {
                depositIndexTokenDelta = extraIndexReserveDelta;
                depositStableTokenDelta = depositDelta - extraIndexReserveDelta;
            }
        } else {
            uint256 extraStableReserveDelta = expectStableDelta - stableReserveDelta;
            if (extraStableReserveDelta >= depositDelta) {
                depositStableTokenDelta = depositDelta;
            } else {
                depositIndexTokenDelta = depositDelta - extraStableReserveDelta;
                depositStableTokenDelta = extraStableReserveDelta;
            }
        }
        depositIndexAmount = AmountMath.getIndexAmount(depositIndexTokenDelta, price);
        depositStableAmount = depositStableTokenDelta;

        // add fee
        depositIndexAmount = depositIndexAmount.divPercentage(PrecisionUtils.percentage() - pair.addLpFeeP);
        depositStableAmount = depositStableAmount.divPercentage(PrecisionUtils.percentage() - pair.addLpFeeP);

        return (depositIndexAmount, depositStableAmount);
    }

    // calculate amount for remove liquidity
    function getReceivedAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    ) public view returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        if (_lpAmount == 0) return (0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        uint256 indexReserveDelta = AmountMath.getStableDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = AmountMath.getStableDelta(_lpAmount, lpFairPrice(_pairIndex));

        // expect delta
        uint256 totalDelta = (indexReserveDelta + stableReserveDelta - receiveDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;

        // received delta of indexToken and stableToken
        uint256 receiveIndexTokenDelta;
        uint256 receiveStableTokenDelta;

        if (indexReserveDelta > expectIndexDelta) {
            uint256 extraIndexReserveDelta = indexReserveDelta - expectIndexDelta;
            if (extraIndexReserveDelta >= receiveDelta) {
                receiveIndexTokenDelta = receiveDelta;
            } else {
                receiveIndexTokenDelta = extraIndexReserveDelta;
                receiveStableTokenDelta = receiveDelta - extraIndexReserveDelta;
            }
        } else {
            uint256 extraStableReserveDelta = stableReserveDelta - expectStableDelta;
            if (extraStableReserveDelta >= receiveDelta) {
                receiveStableTokenDelta = receiveDelta;
            } else {
                receiveIndexTokenDelta = receiveDelta - extraStableReserveDelta;
                receiveStableTokenDelta = extraStableReserveDelta;
            }
        }
        receiveIndexTokenAmount = AmountMath.getIndexAmount(receiveIndexTokenDelta, price);
        receiveStableTokenAmount = receiveStableTokenDelta;

        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function transferTokenTo(address token, address to, uint256 amount) external onlyPositionManagerOrOrderManager {
        IERC20(token).safeTransfer(to, amount);
    }

    function getVault(uint256 _pairIndex) public view returns (Vault memory vault) {
        return vaults[_pairIndex];
    }

    function _getPrice(address _token) internal view returns (uint256) {
        return IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(_token);
    }

    function getPair(uint256 _pairIndex) public view override returns (Pair memory) {
        return pairs[_pairIndex];
    }

    function getTradingConfig(uint256 _pairIndex) external view override returns (TradingConfig memory) {
        return tradingConfigs[_pairIndex];
    }

    function getTradingFeeConfig(uint256 _pairIndex) external view override returns (TradingFeeConfig memory) {
        return tradingFeeConfigs[_pairIndex];
    }

    function getFundingFeeConfig(uint256 _pairIndex) external view override returns (FundingFeeConfig memory) {
        return fundingFeeConfigs[_pairIndex];
    }
}
