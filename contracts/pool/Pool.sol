// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../libraries/PrecisionUtils.sol';
import '../libraries/Roleable.sol';
import '../libraries/Int256Utils.sol';
import './PoolToken.sol';
import '../interfaces/IPoolToken.sol';
import '../interfaces/IOraclePriceFeed.sol';

import '../interfaces/IPool.sol';
import '../libraries/AMMUtils.sol';
import '../libraries/PrecisionUtils.sol';

import '../interfaces/IliquityCallback.sol';

contract Pool is IPool, Roleable {
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;
    using Math for uint256;
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 1e30;
    uint256 public constant PERCENTAGE = 10000;
    uint256 public constant FUNDING_RATE_PERCENTAGE = 1000000;

    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;
    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;

    mapping(address => mapping(address => uint256)) public pairIndexes;
    mapping(address => mapping(address => bool)) public isPairListed;
    uint256 public pairsCount;
    mapping(uint256 => Pair) public pairs;

    mapping(uint256 => Vault) public vaults;

    address public tradingVault;
    address public feeReceiver;
    address public slipReceiver;

    constructor(
        IAddressesProvider addressProvider,
        address _feeReceiver,
        address _slipReceiver
    ) Roleable(addressProvider) {
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
    }

    modifier onlyPairLiquidityAndVault() {
        require(msg.sender == tradingVault, 'forbidden');
        _;
    }

    modifier onlyTradingVault() {
        require(msg.sender == tradingVault, 'forbidden');
        _;
    }

    function setTradingVault(address _tradingVault) external onlyPoolAdmin {
        tradingVault = _tradingVault;
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

    // Manage pairs
    function addPair(address _indexToken, address _stableToken) external onlyPoolAdmin {
        require(_indexToken != _stableToken, 'identical address');
        require(_indexToken != address(0) && _stableToken != address(0), 'zero address');
        require(!isPairListed[_indexToken][_stableToken], 'pair already listed');

        address pairToken = _createPair(_indexToken, _stableToken);

        isPairListed[_indexToken][_stableToken] = true;
        pairIndexes[_indexToken][_stableToken] = pairsCount;

        Pair storage pair = pairs[pairsCount];
        pair.indexToken = _indexToken;
        pair.stableToken = _stableToken;
        pair.pairToken = pairToken;

        emit PairAdded(_indexToken, _stableToken, pairToken, pairsCount++);
    }

    function _createPair(address indexToken, address stableToken) private returns (address) {
        bytes memory bytecode = abi.encodePacked(type(PoolToken).creationCode, abi.encode(indexToken, stableToken));
        bytes32 salt = keccak256(abi.encodePacked(indexToken, stableToken));
        address pairToken;
        assembly {
            pairToken := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IPoolToken(pairToken).setMiner(address(this), true);
        return pairToken;
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');
        require(_pair.expectIndexTokenP <= PERCENTAGE && _pair.addLpFeeP <= PERCENTAGE, 'exceed 100%');

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.expectIndexTokenP = _pair.expectIndexTokenP;
        pair.addLpFeeP = _pair.addLpFeeP;
    }

    function updateTradingConfig(uint256 _pairIndex, TradingConfig calldata _tradingConfig) external onlyPoolAdmin {
        require(
            _tradingConfig.maintainMarginRate <= PERCENTAGE &&
                _tradingConfig.priceSlipP <= PERCENTAGE &&
                _tradingConfig.maxPriceDeviationP <= PERCENTAGE,
            'exceed 100%'
        );
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(
        uint256 _pairIndex,
        TradingFeeConfig calldata _tradingFeeConfig
    ) external onlyPoolAdmin {
        require(_tradingFeeConfig.takerFeeP <= PERCENTAGE && _tradingFeeConfig.makerFeeP <= PERCENTAGE, 'exceed 100%');
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function updateFundingFeeConfig(
        uint256 _pairIndex,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyPoolAdmin {
        require(
            _fundingFeeConfig.minFundingRate <= 0 &&
                _fundingFeeConfig.minFundingRate >= -int256(FUNDING_RATE_PERCENTAGE),
            'exceed min funding rate 100%'
        );
        require(
            _fundingFeeConfig.maxFundingRate >= 0 &&
                _fundingFeeConfig.maxFundingRate <= int256(FUNDING_RATE_PERCENTAGE),
            'exceed max funding rate 100%'
        );
        require(
            _fundingFeeConfig.fundingWeightFactor <= PERCENTAGE &&
                _fundingFeeConfig.liquidityPremiumFactor <= PERCENTAGE &&
                _fundingFeeConfig.lpDistributeP <= PERCENTAGE,
            'exceed 100%'
        );

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function updatePairMiner(uint256 _pairIndex, address _account, bool _enable) external onlyPoolAdmin {
        Pair memory pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');

        IPoolToken(pair.pairToken).setMiner(_account, _enable);
    }

    function increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) public onlyPairLiquidityAndVault {
        _increaseTotalAmount(_pairIndex, _indexAmount, _stableAmount);
    }

    function _increaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) internal {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
    }

    function decreaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) public onlyPairLiquidityAndVault {
        _decreaseTotalAmount(_pairIndex, _indexAmount, _stableAmount);
    }

    function _decreaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) internal {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
    }

    function increaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexReservedAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount + _stableAmount;
    }

    function decreaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexReservedAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount - _stableAmount;
    }

    function transferTokenTo(address token, address to, uint256 amount) public onlyPairLiquidityAndVault {
        IERC20(token).safeTransfer(to, amount);
    }

    function getVault(uint256 _pairIndex) public view returns (Vault memory vault) {
        return vaults[_pairIndex];
    }

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external onlyPairLiquidityAndVault {
        vaults[_pairIndex].averagePrice = _averagePrice;
    }

    function increaseProfit(uint256 _pairIndex, uint256 _profit) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        vault.stableTotalAmount += _profit;
        vault.realisedPnl += int256(_profit);
    }

    function decreaseProfit(uint256 _pairIndex, uint256 _profit) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

        require(_profit <= availableStable, 'stable token not enough');

        vault.stableTotalAmount -= _profit;
        vault.realisedPnl -= int256(_profit);
    }

    function liqiitySwap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _amountOut
    ) public onlyPairLiquidityAndVault {
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

    function setReceiver(address _feeReceiver, address _slipReceiver) external onlyPoolAdmin {
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
    }

    function addLiquidity(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256) {
        return _addLiquidity(msg.sender, msg.sender, _pairIndex, _indexAmount, _stableAmount, data);
    }

    // function addLiquidityETH(uint256 _pairIndex, uint256 _stableAmount) external payable returns (uint256) {
    //     IPool.Pair memory pair = getPair(_pairIndex);
    //     require(pair.indexToken == weth && pair.pairToken != address(0), 'invalid pair');

    //     IWETH(weth).deposit{value: msg.value}();

    //     IWETH(pair.stableToken).transferFrom(msg.sender, address(this), _stableAmount);
    //     return _addLiquidity(address(this), msg.sender, _pairIndex, msg.value, _stableAmount);
    // }

    function addLiquidityForAccount(
        address _funder,
        address _account,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256) {
        return _addLiquidity(_funder, _account, _pairIndex, _indexAmount, _stableAmount, data);
    }

    function removeLiquidity(
        uint256 _pairIndex,
        uint256 _amount
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        (receivedIndexAmount, receivedStableAmount) = _removeLiquidity(msg.sender, address(this), _pairIndex, _amount);

        IPool.Pair memory pair = getPair(_pairIndex);
        // if (receivedIndexAmount > 0 && pair.indexToken == weth) {
        //     IWETH(weth).withdraw(receivedIndexAmount);
        //     payable(msg.sender).sendValue(receivedIndexAmount);
        // }
        if (receivedStableAmount > 0) {
            IERC20(pair.stableToken).transfer(msg.sender, receivedStableAmount);
        }
        return (receivedIndexAmount, receivedStableAmount);
    }

    function removeLiquidityForAccount(
        address _account,
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount
    ) external returns (uint256, uint256) {
        return _removeLiquidity(_account, _receiver, _pairIndex, _amount);
    }

    // function swapInEth(
    //     uint256 _pairIndex,
    //     uint256 _minOut
    // ) external payable returns (uint256 amountIn, uint256 amountOut) {
    //     IPool.Pair memory pair = getPair(_pairIndex);
    //     require(pair.indexToken == weth && pair.pairToken != address(0), 'invalid pair');

    //     IWETH(weth).deposit{value: msg.value}();
    //     IERC20(weth).approve(address(this), msg.value);

    //     (amountIn, amountOut) = _swap(address(this), msg.sender, _pairIndex, false, msg.value, _minOut);

    //     // send last eth back
    //     if (amountIn < msg.value) {
    //         uint256 lastETH = msg.value - amountIn;
    //         IWETH(weth).withdraw(lastETH);
    //         payable(msg.sender).sendValue(lastETH);
    //     }
    //     return (amountIn, amountOut);
    // }

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut
    ) external returns (uint256 amountIn, uint256 amountOut) {
        (amountIn, amountOut) = _swap(msg.sender, address(this), _pairIndex, _isBuy, _amountIn, _minOut);
        // if (amountOut > 0 && _isBuy && getPair(_pairIndex).indexToken == weth) {
        // IWETH(weth).withdraw(amountOut);
        // payable(msg.sender).sendValue(amountOut);
        // }
        return (amountIn, amountOut);
    }

    function swapForAccount(
        address _funder,
        address _receiver,
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut
    ) external returns (uint256 amountIn, uint256 amountOut) {
        return _swap(_funder, _receiver, _pairIndex, _isBuy, _amountIn, _minOut);
    }

    function _swap(
        address _funder,
        address _receiver,
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut
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

            transferTokenTo(pair.indexToken, _receiver, amountOut);
            IERC20(pair.stableToken).safeTransferFrom(_funder, address(this), amountIn);
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

            IERC20(pair.indexToken).safeTransferFrom(_funder, address(this), amountIn);
            transferTokenTo(pair.stableToken, _receiver, amountOut);
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
        IliquityCallback(msg.sender).addLiquityCallback(indexAmount, stableAmount, data);

        if (indexAmount > 0)
            require(balanceIndexBefore.add(indexAmount) <= IERC20(indexToken).balanceOf(address(this)), 'ti');
        if (stableAmount > 0)
            require(balanceStableBefore.add(stableAmount) <= IERC20(stableToken).balanceOf(address(this)), 'ts');
    }

    function _addLiquidity(
        address recipient,
        address _account,
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

        {
            // transfer fee
            uint256 indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
            uint256 stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);

            IERC20(pair.indexToken).safeTransfer(feeReceiver, indexFeeAmount);
            IERC20(pair.stableToken).safeTransfer(feeReceiver, stableFeeAmount);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }

        // usdt value of reserve
        {
            uint256 price = _getPrice(pair.indexToken);
            require(price > 0, 'invalid price');

            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

            // usdt value of deposit
            uint256 indexDepositDelta = _getDelta(afterFeeIndexAmount, price);

            // calculate deposit usdt value without slippage
            uint256 slipDelta;
            if (indexReserveDelta + vault.stableTotalAmount > 0) {
                // after deposit
                uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
                uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;
                // expect delta
                uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
                uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = totalDelta - expectIndexDelta;

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                        ? (indexDepositDelta - needSwapIndexDelta)
                        : indexDepositDelta;

                    slipDelta = AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    uint256 slipAmount = _getAmount(slipDelta, price);

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    IERC20(pair.indexToken).safeTransfer(slipReceiver, slipAmount);
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                        ? (afterFeeStableAmount - needSwapStableDelta)
                        : afterFeeStableAmount;

                    slipDelta =
                        swapStableDelta -
                        _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);

                    afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                    IERC20(pair.stableToken).safeTransfer(slipReceiver, slipDelta);
                }
            }
            // mint lp
            mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));
        }
        IPoolToken(pair.pairToken).mint(_account, mintAmount);

        _increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        emit AddLiquidity(recipient, _account, _pairIndex, _indexAmount, _stableAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(
        address _account,
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount
    ) private returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_amount > 0, 'invalid amount');
        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        require(IERC20(pair.pairToken).balanceOf(_account) >= _amount, 'insufficient balance');

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

        IPoolToken(pair.pairToken).burn(_account, _amount);

        transferTokenTo(pair.indexToken, _receiver, receiveIndexTokenAmount);
        transferTokenTo(pair.stableToken, _receiver, receiveStableTokenAmount);

        emit RemoveLiquidity(
            _account,
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
        uint256 lpFairDelta = _getDelta(vault.indexTotalAmount, price) + vault.stableTotalAmount;
        return
            lpFairDelta > 0
                ? Math.mulDiv(lpFairDelta, PRICE_PRECISION, IERC20(pair.pairToken).totalSupply())
                : 1 * PRICE_PRECISION;
    }

    function _getDelta(uint256 amount, uint256 price) internal pure returns (uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function _getAmount(uint256 delta, uint256 price) internal pure returns (uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    // calculate lp amount for add liquidity
    function getMintLpAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external view returns (uint256 mintAmount, address slipToken, uint256 slipAmount) {
        if (_indexAmount == 0 && _stableAmount == 0) return (0, address(0), 0);

        IPool.Pair memory pair = getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPool.Vault memory vault = getVault(_pairIndex);
        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
            uint256 stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }

        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        // calculate deposit usdt value without slippage
        uint256 slipDelta;

        // usdt value of deposit
        uint256 indexDepositDelta = _getDelta(afterFeeIndexAmount, price);

        {
            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

            if (indexReserveDelta + vault.stableTotalAmount > 0) {
                // after deposit
                uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
                uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;

                uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
                uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = totalDelta - expectIndexDelta;

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                        ? (indexDepositDelta - needSwapIndexDelta)
                        : indexDepositDelta;

                    slipDelta = AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    slipAmount = _getAmount(slipDelta, price);
                    slipToken = pair.indexToken;

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                        ? (afterFeeStableAmount - needSwapStableDelta)
                        : afterFeeStableAmount;

                    slipDelta =
                        swapStableDelta -
                        _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);
                    slipAmount = slipDelta;
                    slipToken = pair.stableToken;

                    afterFeeStableAmount = afterFeeStableAmount - slipAmount;
                }
            }
        }

        // mint lp
        mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));

        return (mintAmount, slipToken, slipAmount);
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

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;
        uint256 depositDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));

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
        depositIndexAmount = _getAmount(depositIndexTokenDelta, price);
        depositStableAmount = depositStableTokenDelta;

        // add fee
        depositIndexAmount = depositIndexAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);
        depositStableAmount = depositStableAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);

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

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));

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
        receiveIndexTokenAmount = _getAmount(receiveIndexTokenDelta, price);
        receiveStableTokenAmount = receiveStableTokenDelta;

        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function _getPrice(address _token) internal view returns (uint256) {
        return IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(_token);
    }
}
