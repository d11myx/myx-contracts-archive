// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IWETH.sol';
import '../interfaces/IPairInfo.sol';
import '../interfaces/IPairLiquidity.sol';
import '../interfaces/IPairVault.sol';
import '../libraries/Roleable.sol';
import '../libraries/AMMUtils.sol';
import '../libraries/PrecisionUtils.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../token/PairToken.sol';

import 'hardhat/console.sol';

contract PoolLiquidity is IPairLiquidity, Roleable {
    using Math for uint256;
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    uint256 public constant PRICE_PRECISION = 1e30;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    // IOraclePriceFeed public vaultPriceFeed;

    address public feeReceiver;

    address public slipReceiver;

    address public weth;

    receive() external payable {}

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        address _feeReceiver,
        address _slipReceiver,
        address _weth
    ) Roleable(addressProvider) {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
        weth = _weth;
    }

    function setContract(IPairInfo _pairStorage, IPairVault _pairVault) external onlyPoolAdmin {
         pairInfo = _pairStorage;
         pairVault = _pairVault;
     }

    function setReceiver(address _feeReceiver, address _slipReceiver) external onlyPoolAdmin {
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
    }

    function addLiquidity(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external returns (uint256) {
        return _addLiquidity(msg.sender, msg.sender, _pairIndex, _indexAmount, _stableAmount);
    }

    function addLiquidityETH(uint256 _pairIndex, uint256 _stableAmount) external payable returns (uint256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.indexToken == weth && pair.pairToken != address(0), 'invalid pair');

        IWETH(weth).deposit{value: msg.value}();

        IWETH(pair.stableToken).transferFrom(msg.sender, address(this), _stableAmount);
        return _addLiquidity(address(this), msg.sender, _pairIndex, msg.value, _stableAmount);
    }

    function addLiquidityForAccount(
        address _funder,
        address _account,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external returns (uint256) {
        return _addLiquidity(_funder, _account, _pairIndex, _indexAmount, _stableAmount);
    }

    function removeLiquidity(
        uint256 _pairIndex,
        uint256 _amount
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        (receivedIndexAmount, receivedStableAmount) = _removeLiquidity(msg.sender, address(this), _pairIndex, _amount);

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        if (receivedIndexAmount > 0 && pair.indexToken == weth) {
            IWETH(weth).withdraw(receivedIndexAmount);
            payable(msg.sender).sendValue(receivedIndexAmount);
        }
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

    function swapInEth(
        uint256 _pairIndex,
        uint256 _minOut
    ) external payable returns (uint256 amountIn, uint256 amountOut) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.indexToken == weth && pair.pairToken != address(0), 'invalid pair');

        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).approve(address(this), msg.value);

        (amountIn, amountOut) = _swap(address(this), msg.sender, _pairIndex, false, msg.value, _minOut);

        // send last eth back
        if (amountIn < msg.value) {
            uint256 lastETH = msg.value - amountIn;
            IWETH(weth).withdraw(lastETH);
            payable(msg.sender).sendValue(lastETH);
        }
        return (amountIn, amountOut);
    }

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut
    ) external returns (uint256 amountIn, uint256 amountOut) {
        (amountIn, amountOut) = _swap(msg.sender, address(this), _pairIndex, _isBuy, _amountIn, _minOut);
        if (amountOut > 0 && _isBuy && pairInfo.getPair(_pairIndex).indexToken == weth) {
            IWETH(weth).withdraw(amountOut);
            payable(msg.sender).sendValue(amountOut);
        }
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
        console.log('swap funder %s receiver %s', _funder, _receiver);
        console.log('swap pairIndex %s isBuy %s expectAmountIn %s', _pairIndex, _isBuy, _amountIn);

        require(_amountIn > 0, 'swap invalid amount in');

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'swap invalid pair');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        uint256 price = _getPrice(pair.indexToken);

        // total delta
        uint256 indexTotalDelta = vault.indexTotalAmount.mulPrice(price);
        uint256 stableTotalDelta = vault.stableTotalAmount;
        console.log('swap indexTotalDelta %s stableTotalDelta %s', indexTotalDelta, stableTotalDelta);

        uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;
        console.log('swap expectIndexDelta %s expectStableDelta %s', expectIndexDelta, expectStableDelta);

        if (_isBuy) {
            // index out stable in
            require(expectStableDelta > stableTotalDelta, 'no need stable token');

            uint256 stableInDelta = _amountIn;
            stableInDelta = stableInDelta.min(expectStableDelta - stableTotalDelta);
            console.log('swap stableInDelta', stableInDelta);

            amountOut = stableInDelta.divPrice(price);
            uint256 availableIndex = vault.indexTotalAmount - vault.indexReservedAmount;
            console.log('swap amountOut indexToken %s availableIndex %s', amountOut, availableIndex);

            require(availableIndex > 0, 'no available index token');

            amountOut = amountOut.min(availableIndex);
            amountIn = amountOut.divPrice(price);

            console.log('swap amountIn %s amountOut %s', amountIn, amountOut);
            require(amountOut >= _minOut, 'insufficient minOut');

            pairVault.swap(_pairIndex, _isBuy, amountIn, amountOut);

            pairVault.transferTokenTo(pair.indexToken, _receiver, amountOut);
            IERC20(pair.stableToken).safeTransferFrom(_funder, address(pairVault), amountIn);
        } else {
            // index in stable out
            require(expectIndexDelta > indexTotalDelta, 'no need index token');

            uint256 indexInDelta = _amountIn.mulPrice(price);
            indexInDelta = indexInDelta.min(expectIndexDelta - indexTotalDelta);
            console.log('swap indexInDelta', indexInDelta);

            amountOut = indexInDelta;
            uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;
            console.log('swap amountOut stableToken %s availableStable %s', amountOut, availableStable);

            require(availableStable > 0, 'no stable token');

            amountOut = amountOut.min(availableStable);
            amountIn = amountOut.divPrice(price);

            IERC20(pair.indexToken).safeTransferFrom(_funder, address(pairVault), amountIn);
            pairVault.transferTokenTo(pair.stableToken, _receiver, amountOut);
        }

        emit Swap(_funder, _receiver, _pairIndex, _isBuy, amountIn, amountOut);
    }

    function _addLiquidity(
        address _funder,
        address _account,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) private returns (uint256 mintAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, 'invalid amount');

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        console.log('addLiquidity indexAmount', _indexAmount, 'stableAmount', _stableAmount);
        // transfer token
        if (_funder != address(this)) {
            IERC20(pair.indexToken).safeTransferFrom(_funder, address(this), _indexAmount);
            IERC20(pair.stableToken).safeTransferFrom(_funder, address(this), _stableAmount);
        }
        // fee
        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
            uint256 stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);
            console.log('addLiquidity indexFeeAmount', indexFeeAmount, 'stableFeeAmount', stableFeeAmount);

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
                console.log('addLiquidity indexTotalDelta', indexTotalDelta, 'stableTotalDelta', stableTotalDelta);

                // expect delta
                uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
                uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = totalDelta - expectIndexDelta;
                console.log('addLiquidity expectIndexDelta', expectIndexDelta, 'expectStableDelta', expectStableDelta);

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                        ? (indexDepositDelta - needSwapIndexDelta)
                        : indexDepositDelta;
                    console.log(
                        'addLiquidity needSwapIndexDelta',
                        needSwapIndexDelta,
                        'swapIndexDelta',
                        swapIndexDelta
                    );

                    slipDelta = AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    uint256 slipAmount = _getAmount(slipDelta, price);

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    IERC20(pair.indexToken).safeTransfer(slipReceiver, slipAmount);
                    console.log('addLiquidity slipDelta', slipDelta, 'afterFeeIndexAmount', afterFeeIndexAmount);
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                        ? (afterFeeStableAmount - needSwapStableDelta)
                        : afterFeeStableAmount;
                    console.log(
                        'addLiquidity needSwapStableDelta',
                        needSwapStableDelta,
                        'swapStableDelta',
                        swapStableDelta
                    );

                    slipDelta =
                        swapStableDelta -
                        _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);

                    afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                    IERC20(pair.stableToken).safeTransfer(slipReceiver, slipDelta);
                    console.log('addLiquidity slipDelta', slipDelta, 'afterFeeStableAmount', afterFeeStableAmount);
                }
            }
            // mint lp
            mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));
            console.log(
                'addLiquidity indexDepositDelta',
                indexDepositDelta,
                'afterFeeStableAmount',
                afterFeeStableAmount
            );
        }
        IPairToken(pair.pairToken).mint(_account, mintAmount);

        pairVault.increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        IERC20(pair.indexToken).safeTransfer(address(pairVault), afterFeeIndexAmount);
        IERC20(pair.stableToken).safeTransfer(address(pairVault), afterFeeStableAmount);
        console.log(
            'addLiquidity afterFeeIndexAmount',
            afterFeeIndexAmount,
            'afterFeeStableAmount',
            afterFeeStableAmount
        );

        emit AddLiquidity(_funder, _account, _pairIndex, _indexAmount, _stableAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(
        address _account,
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount
    ) private returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_amount > 0, 'invalid amount');
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        require(IERC20(pair.pairToken).balanceOf(_account) >= _amount, 'insufficient balance');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        (receiveIndexTokenAmount, receiveStableTokenAmount) = getReceivedAmount(_pairIndex, _amount);

        require(
            receiveIndexTokenAmount <= vault.indexTotalAmount - vault.indexReservedAmount,
            'insufficient indexToken amount'
        );
        require(
            receiveStableTokenAmount <= vault.stableTotalAmount - vault.stableReservedAmount,
            'insufficient stableToken amount'
        );

        pairVault.decreaseTotalAmount(_pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount);

        IPairToken(pair.pairToken).burn(_account, _amount);

        pairVault.transferTokenTo(pair.indexToken, _receiver, receiveIndexTokenAmount);
        pairVault.transferTokenTo(pair.stableToken, _receiver, receiveStableTokenAmount);

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
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);
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

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        console.log('getMintLpAmount indexAmount', _indexAmount, 'stableAmount', _stableAmount);

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
        console.log('getMintLpAmount indexDepositDelta', indexDepositDelta);

        {
            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

            if (indexReserveDelta + vault.stableTotalAmount > 0) {
                // after deposit
                uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
                uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;
                console.log('getMintLpAmount indexTotalDelta', indexTotalDelta, 'stableTotalDelta', stableTotalDelta);

                uint256 totalDelta = (indexTotalDelta + stableTotalDelta);
                uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = totalDelta - expectIndexDelta;
                console.log(
                    'getMintLpAmount expectIndexDelta',
                    expectIndexDelta,
                    'expectStableDelta',
                    expectStableDelta
                );

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta
                        ? (indexDepositDelta - needSwapIndexDelta)
                        : indexDepositDelta;
                    console.log(
                        'getMintLpAmount needSwapIndexDelta',
                        needSwapIndexDelta,
                        'swapIndexDelta',
                        swapIndexDelta
                    );

                    slipDelta = AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    slipAmount = _getAmount(slipDelta, price);
                    slipToken = pair.indexToken;

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    console.log('getMintLpAmount slipDelta', slipDelta, 'afterFeeIndexAmount', afterFeeIndexAmount);
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta
                        ? (afterFeeStableAmount - needSwapStableDelta)
                        : afterFeeStableAmount;
                    console.log(
                        'getMintLpAmount needSwapStableDelta',
                        needSwapStableDelta,
                        'swapStableDelta',
                        swapStableDelta
                    );

                    slipDelta =
                        swapStableDelta -
                        _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);
                    slipAmount = slipDelta;
                    slipToken = pair.stableToken;

                    afterFeeStableAmount = afterFeeStableAmount - slipAmount;
                    console.log('getMintLpAmount slipDelta', slipDelta, 'afterFeeStableAmount', afterFeeStableAmount);
                }
            }
        }
        console.log(
            'getMintLpAmount afterFeeIndexAmount',
            afterFeeIndexAmount,
            'afterFeeStableAmount',
            afterFeeStableAmount
        );
        // mint lp
        mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));
        console.log(
            'getMintLpAmount indexDepositDelta',
            indexDepositDelta,
            'afterFeeStableAmount',
            afterFeeStableAmount
        );
        return (mintAmount, slipToken, slipAmount);
    }

    // calculate deposit amount for add liquidity
    function getDepositAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    ) external view returns (uint256 depositIndexAmount, uint256 depositStableAmount) {
        if (_lpAmount == 0) return (0, 0);

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;
        uint256 depositDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));
        console.log('getMintLpAmount depositDelta', depositDelta);

        // expect delta
        uint256 totalDelta = (indexReserveDelta + stableReserveDelta + depositDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;
        console.log('getDepositAmount expectIndexDelta', expectIndexDelta, 'expectStableDelta', expectStableDelta);

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
            console.log(
                'getDepositAmount depositIndexTokenDelta',
                depositIndexTokenDelta,
                'depositStableTokenDelta',
                depositStableTokenDelta
            );
        } else {
            uint256 extraStableReserveDelta = expectStableDelta - stableReserveDelta;
            if (extraStableReserveDelta >= depositDelta) {
                depositStableTokenDelta = depositDelta;
            } else {
                depositIndexTokenDelta = depositDelta - extraStableReserveDelta;
                depositStableTokenDelta = extraStableReserveDelta;
            }
            console.log(
                'getDepositAmount depositIndexTokenDelta',
                depositIndexTokenDelta,
                'depositStableTokenDelta',
                depositStableTokenDelta
            );
        }
        depositIndexAmount = _getAmount(depositIndexTokenDelta, price);
        depositStableAmount = depositStableTokenDelta;
        console.log(
            'getDepositAmount depositIndexAmount',
            depositIndexAmount,
            'depositStableAmount',
            depositStableAmount
        );

        // add fee
        depositIndexAmount = depositIndexAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);
        depositStableAmount = depositStableAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);
        console.log(
            'getDepositAmount depositIndexAmount',
            depositIndexAmount,
            'depositStableAmount',
            depositStableAmount
        );
        return (depositIndexAmount, depositStableAmount);
    }

    // calculate amount for remove liquidity
    function getReceivedAmount(
        uint256 _pairIndex,
        uint256 _lpAmount
    ) public view returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        if (_lpAmount == 0) return (0, 0);

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), 'invalid pair');

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, 'invalid price');

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));
        console.log('getReceivedAmount receiveDelta', receiveDelta);

        // expect delta
        uint256 totalDelta = (indexReserveDelta + stableReserveDelta - receiveDelta);
        uint256 expectIndexDelta = totalDelta.mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = totalDelta - expectIndexDelta;
        console.log('getReceivedAmount expectIndexDelta', expectIndexDelta, 'expectStableDelta', expectStableDelta);

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
            console.log(
                'getReceivedAmount receiveIndexTokenDelta',
                receiveIndexTokenDelta,
                'receiveStableTokenDelta',
                receiveStableTokenDelta
            );
        } else {
            uint256 extraStableReserveDelta = stableReserveDelta - expectStableDelta;
            if (extraStableReserveDelta >= receiveDelta) {
                receiveStableTokenDelta = receiveDelta;
            } else {
                receiveIndexTokenDelta = receiveDelta - extraStableReserveDelta;
                receiveStableTokenDelta = extraStableReserveDelta;
            }
            console.log(
                'getReceivedAmount receiveIndexTokenDelta',
                receiveIndexTokenDelta,
                'receiveStableTokenDelta',
                receiveStableTokenDelta
            );
        }
        receiveIndexTokenAmount = _getAmount(receiveIndexTokenDelta, price);
        receiveStableTokenAmount = receiveStableTokenDelta;
        console.log(
            'getReceivedAmount receiveIndexTokenAmount',
            receiveIndexTokenAmount,
            'receiveStableTokenAmount',
            receiveStableTokenAmount
        );
        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function _getPrice(address _token) internal view returns (uint256) {
        return IOraclePriceFeed(ADDRESS_PROVIDER.getPriceOracle()).getPrice(_token);
    }
}
