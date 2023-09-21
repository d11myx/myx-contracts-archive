// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

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
import "../interfaces/IPriceOracle.sol";
import "../token/interfaces/IBaseToken.sol";

import "../libraries/AmountMath.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Roleable.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/AMMUtils.sol";
import "../libraries/PrecisionUtils.sol";

import "../interfaces/IPoolTokenFactory.sol";
import "../interfaces/ILiquidityCallback.sol";
import "../helpers/ValidationHelper.sol";

contract Pool is IPool, Roleable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;
    using Math for uint256;
    using SafeMath for uint256;
    uint256 private constant MAX_FEE = 1e6;

    IPoolTokenFactory public immutable poolTokenFactory;
    address public router;
    mapping(uint256 => mapping(address => bytes)) tokenPath;

    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;

    mapping(address => mapping(address => uint256)) public override getPairIndex;
    mapping(address => mapping(address => bool)) public isPairListed;

    uint256 public pairsCount;
    mapping(uint256 => Pair) public pairs;
    mapping(uint256 => Vault) public vaults;
    EnumerableSet.AddressSet private positionManagers;
    EnumerableSet.AddressSet private orderManagers;

    mapping(address => uint256) public feeTokenAmounts;
    mapping(address => bool) public isStableToken;

    constructor(
        IAddressesProvider addressProvider,
        IPoolTokenFactory _poolTokenFactory
    ) Roleable(addressProvider) {
        poolTokenFactory = _poolTokenFactory;
    }

    modifier onlyPositionManagerOrOrderManager() {
        require(
            positionManagers.contains(msg.sender) || orderManagers.contains(msg.sender),
            "onlyPositionManagerOrOrderManager"
        );
        _;
    }

    modifier onlyPositionManager() {
        require(positionManagers.contains(msg.sender), "forbidden");
        _;
    }

    function addPositionManager(address _positionManager) external onlyPoolAdmin {
        positionManagers.add(_positionManager);
    }

    function setRouter(address _router) external onlyPoolAdmin {
        router = _router;
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
        require(!isStableToken[_indexToken], "!stable token");
        require(!isPairListed[_indexToken][_stableToken], "pair already listed");

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

    function updatePairMiner(
        uint256 _pairIndex,
        address _account,
        bool _enable
    ) external onlyPoolAdmin {
        Pair memory pair = pairs[_pairIndex];
        require(
            pair.indexToken != address(0) && pair.stableToken != address(0),
            "pair not existed"
        );

        IBaseToken(pair.pairToken).setMiner(_account, _enable);
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

    function updateAveragePrice(
        uint256 _pairIndex,
        uint256 _averagePrice
    ) external onlyPositionManager {
        vaults[_pairIndex].averagePrice = _averagePrice;
        emit UpdateAveragePrice(_pairIndex, _averagePrice);
    }

    function setLPStableProfit(uint256 _pairIndex, int256 _profit) external onlyPositionManager {
        Vault storage vault = vaults[_pairIndex];
        Pair memory pair = pairs[_pairIndex];
        if (_profit > 0) {
            vault.stableTotalAmount += _profit.abs();
        } else {
            if (vault.stableTotalAmount < _profit.abs()) {
                swapInUni(_pairIndex, pair.stableToken, _profit.abs());
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
                swapInUni(_pairIndex, pair.indexToken, _profit.abs());
            }
            vault.stableTotalAmount -= _profit.abs();
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

        return _addLiquidity(msg.sender, recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function addLiquidityForAccount(
        address _funder,
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        ValidationHelper.validateAccountBlacklist(ADDRESS_PROVIDER, recipient);

        return _addLiquidity(_funder, recipient, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function removeLiquidity(
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount,
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

    function swapInUni(uint256 _pairIndex, address tokenIn, uint256 amountOut) public {
        Pair memory pair = pairs[_pairIndex];
        uint256 price = getPrice(pair.indexToken);
        bytes memory path = tokenPath[_pairIndex][tokenIn];
        uint256 amountInMaximum;
        if (tokenIn == pair.indexToken) {
            amountInMaximum = (amountOut * 12) / (price * 10);
        } else if (tokenIn == pair.stableToken) {
            amountInMaximum = (amountOut * price * 12) / 10;
        }
        IERC20(pair.indexToken).approve(router, amountInMaximum);
        IUniSwapV3Router(router).exactOutput(
            IUniSwapV3Router.ExactOutputParams({
                path: path,
                recipient: address(this),
                deadline: block.timestamp + 1000,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum
            })
        );
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
                    availableDiscountAmount = expectIndexDelta.mul(indexTotalDelta);
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
                    availableDiscountAmount = expectStableDelta.mul(stableTotalDelta);
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

        uint256 mintDelta = indexDepositDelta + afterFeeStableAmount - slipDelta;

        // mint with discount
        if (availableDiscountRate > 0) {
            if (mintDelta > availableDiscountAmount) {
                mintAmount += AmountMath.getIndexAmount(
                    availableDiscountAmount,
                    lpFairPrice(_pairIndex).mul(PrecisionUtils.percentage() - availableDiscountRate)
                );
                mintDelta -= availableDiscountAmount;
            } else {
                mintAmount += AmountMath.getIndexAmount(
                    mintDelta,
                    lpFairPrice(_pairIndex).mul(PrecisionUtils.percentage() - availableDiscountRate)
                );
                mintDelta -= mintDelta;
            }
        }

        if (mintDelta > 0) {
            mintAmount += AmountMath.getIndexAmount(mintDelta, lpFairPrice(_pairIndex));
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
        address _account,
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

        return (mintAmount, slipToken, slipAmount);
    }

    function _removeLiquidity(
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount,
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

        IPool.Vault memory vault = getVault(_pairIndex);

        (receiveIndexTokenAmount, receiveStableTokenAmount, feeAmount) = getReceivedAmount(
            _pairIndex,
            _amount
        );

        require(
            receiveIndexTokenAmount <= vault.indexTotalAmount - vault.indexReservedAmount,
            "insufficient indexToken amount"
        );
        require(
            receiveStableTokenAmount <= vault.stableTotalAmount - vault.stableReservedAmount,
            "insufficient stableToken amount"
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
            _amount,
            feeAmount
        );

        return (receiveIndexTokenAmount, receiveStableTokenAmount, feeAmount);
    }

    function lpFairPrice(uint256 _pairIndex) public view returns (uint256) {
        IPool.Pair memory pair = getPair(_pairIndex);
        IPool.Vault memory vault = getVault(_pairIndex);
        uint256 price = getPrice(pair.indexToken);

        uint256 lpFairDelta = AmountMath.getStableDelta(_getIndexTotalAmount(pair, vault), price) +
            _getStableTotalAmount(pair, vault);
        // return lpFairDelta;
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
            uint256 feeAmount
        )
    {
        if (_lpAmount == 0) return (0, 0, 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPool.Vault memory vault = getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = AmountMath.getStableDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = AmountMath.getStableDelta(_lpAmount, lpFairPrice(_pairIndex));
        feeAmount = receiveDelta.mulPercentage(pair.removeLpFeeP);
        receiveDelta = receiveDelta - feeAmount;
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

        return (receiveIndexTokenAmount, receiveStableTokenAmount, feeAmount);
    }

    function transferTokenTo(
        address token,
        address to,
        uint256 amount
    ) external onlyPositionManagerOrOrderManager {
        require(IERC20(token).balanceOf(address(this)) > amount, "bal");
        IERC20(token).safeTransfer(to, amount);
    }

    function transferTokenOrSwap(
        uint256 pairIndex,
        address token,
        address to,
        uint256 amount
    ) external onlyPositionManagerOrOrderManager {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < amount) {
            swapInUni(pairIndex, token, amount);
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
        return IPriceOracle(ADDRESS_PROVIDER.priceOracle()).getOraclePrice(_token);
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
