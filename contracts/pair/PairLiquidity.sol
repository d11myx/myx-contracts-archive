// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts/token/ERC20/IERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";
import "../openzeeplin/contracts/utils/Address.sol";

import "./interfaces/IPairInfo.sol";
import "./interfaces/IPairLiquidity.sol";
import "./interfaces/IPairVault.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/AMMUtils.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../token/PairToken.sol";
import "../token/WETH.sol";

contract PairLiquidity is IPairLiquidity, Handleable {

    uint256 public constant PRECISION = 1e10;
    uint256 public constant PRICE_PRECISION = 1e30;

    IPairInfo public pairInfo;
    IPairVault public pairVault;

//    IVaultPriceFeed public vaultPriceFeed;

    address public feeReceiver;

    address public slipReceiver;

    address public weth;

    // pairToken => user => amount
    mapping(address => mapping(address => uint256)) public userPairTokens;

    mapping(uint256 => uint256) public indexTokenPrice; // todo for test

    event AddLiquidity(
        address indexed account,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount
    );

    event RemoveLiquidity(
        address indexed account,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount
    );

    function initialize(
        IPairInfo _pairStorage,
        IPairVault _pairVault,
        address _feeReceiver,
        address _slipReceiver,
        address _weth
    ) external initializer {
        __Handleable_init();
        pairInfo = _pairStorage;
        pairVault = _pairVault;
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
        weth = _weth;
    }

    function setContract(IPairInfo _pairStorage, IPairVault _pairVault) external onlyHandler {
        pairInfo = _pairStorage;
        pairVault = _pairVault;
    }

    function setReceiver(address _feeReceiver, address _slipReceiver) external onlyHandler {
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
    }

    // for test
    function setIndexTokenPrice(uint256 _pairToken, uint256 _price) external {
        indexTokenPrice[_pairToken] = _price;
    }

    function addLiquidity(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external returns (uint256) {
        return _addLiquidity(msg.sender, msg.sender, _pairIndex, _indexAmount, _stableAmount);
    }

    function addLiquidityETH(uint256 _pairIndex, uint256 _stableAmount) external payable returns (uint256) {
        WETH(weth).deposit{value: msg.value}();
        return _addLiquidity(address(this), msg.sender, _pairIndex, msg.value, _stableAmount);
    }

    function addLiquidityForAccount(address _funder, address _account, uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler returns (uint256) {
        return _addLiquidity(_funder, _account, _pairIndex, _indexAmount, _stableAmount);
    }

    function removeLiquidity(uint256 _pairIndex, uint256 _amount) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        (receivedIndexAmount, receivedStableAmount) = _removeLiquidity(msg.sender, msg.sender, _pairIndex, _amount);
        if (receivedIndexAmount > 0 && pairInfo.getPair(_pairIndex).indexToken == weth) {
            WETH(weth).withdraw(receivedIndexAmount);
            Address.sendValue(payable(msg.sender), receivedIndexAmount);
        }
        return (receivedIndexAmount, receivedStableAmount);
    }

    function removeLiquidityForAccount(address _account, address _receiver, uint256 _pairIndex, uint256 _amount) external onlyHandler returns (uint256, uint256) {
        return _removeLiquidity(_account, _receiver, _pairIndex, _amount);
    }

    function _addLiquidity(address _funder, address _account, uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) private returns (uint256 mintAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, "invalid amount");

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        // init liquidity
        if (vault.indexTotalAmount == 0 && vault.stableTotalAmount == 0) {
            uint256 indexDesiredAmount = Math.mulDiv(_stableAmount, pair.initPairRatio, 100 * PRECISION);
            uint256 stableDesiredAmount = Math.mulDiv(_indexAmount, 100 * PRECISION, pair.initPairRatio);
            if (indexDesiredAmount <= _indexAmount) {
                _indexAmount = indexDesiredAmount;
            } else {
                _stableAmount = stableDesiredAmount;
            }
        }

        // transfer token
        IERC20(pair.indexToken).transferFrom(_funder, address(this), _indexAmount);
        IERC20(pair.stableToken).transferFrom(_funder, address(this), _stableAmount);


        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = Math.mulDiv(_indexAmount, pair.fee.addLpFeeP, 100 * PRECISION);
            uint256 stableFeeAmount = Math.mulDiv(_stableAmount, pair.fee.addLpFeeP, 100 * PRECISION);

            IERC20(pair.indexToken).transfer(feeReceiver, indexFeeAmount);
            IERC20(pair.stableToken).transfer(feeReceiver, stableFeeAmount);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }

        // usdt value of reserve
        {
            uint256 price = indexTokenPrice[_pairIndex];
            require(price > 0, "invalid price");

            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

            // usdt value of deposit
            uint256 indexDepositDelta = _getDelta(afterFeeIndexAmount, price);

            // calculate deposit usdt value without slippage
            uint256 slipDelta;
            if (indexReserveDelta + vault.stableTotalAmount > 0) {

                // after deposit
                uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
                uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;

                // reserve: 70 30
                // deposit: 40 20
                // total:  110 50
                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > stableTotalDelta) {
                    // 60 / 2 = 30
                    // 40 - 30 -> 20 + 30
                    uint256 needSwapIndexDelta = (indexTotalDelta - stableTotalDelta) / 2;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta ? (indexDepositDelta - needSwapIndexDelta) : indexDepositDelta;

                    slipDelta =  AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    uint256 slipAmount = _getAmount(slipDelta, price);

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    IERC20(pair.indexToken).transfer(slipReceiver, slipAmount);
                } else if (indexTotalDelta < stableTotalDelta) {
                    uint256 needSwapStableDelta = (stableTotalDelta - indexTotalDelta) / 2;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta ? (afterFeeStableAmount - needSwapStableDelta) : afterFeeStableAmount;

                    slipDelta = swapStableDelta - _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);

                    afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                    IERC20(pair.stableToken).transfer(slipReceiver, slipDelta);
                }
            }
            // mint lp
            mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex, price));
        }
        IPairToken(pair.pairToken).mint(address(this), mintAmount);
        userPairTokens[pair.pairToken][_account] = userPairTokens[pair.pairToken][_account] + mintAmount;

        pairVault.increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        IERC20(pair.indexToken).transfer(address(pairVault), afterFeeIndexAmount);
        IERC20(pair.stableToken).transfer(address(pairVault), afterFeeStableAmount);

        emit AddLiquidity(_account, _pairIndex, _indexAmount, _stableAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(address _account, address _receiver, uint256 _pairIndex, uint256 _amount) private
    returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_amount > 0, "invalid amount");
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        require(userPairTokens[pair.pairToken][_account] >= _amount, "insufficient balance");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        (receiveIndexTokenAmount, receiveStableTokenAmount) = getReceivedAmount(_pairIndex, _amount);

        require(receiveIndexTokenAmount <= vault.indexTotalAmount - vault.indexReservedAmount, "insufficient indexToken amount");
        require(receiveStableTokenAmount <= vault.stableTotalAmount - vault.stableReservedAmount, "insufficient stableToken amount");

        pairVault.decreaseTotalAmount(_pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount);

        IPairToken(pair.pairToken).burn(address(this), _amount);
        userPairTokens[pair.pairToken][_account] = userPairTokens[pair.pairToken][_account] - _amount;

        pairVault.transferTokenTo(pair.indexToken, _receiver, receiveIndexTokenAmount);
        pairVault.transferTokenTo(pair.stableToken, _receiver, receiveStableTokenAmount);

        emit RemoveLiquidity(_account, _pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount, _amount);

        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function lpFairPrice(uint256 _pairIndex, uint256 _indexTokenPrice) public view returns(uint256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);
        uint256 lpFairDelta = _getDelta(vault.indexTotalAmount, _indexTokenPrice) + vault.stableTotalAmount;
        return lpFairDelta > 0 ? Math.mulDiv(lpFairDelta, PRICE_PRECISION, IERC20(pair.pairToken).totalSupply()) : 1 * PRICE_PRECISION;
    }

    function _getDelta(uint256 amount, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function _getAmount(uint256 delta, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    // calculate lp amount for add liquidity
    function getMintLpAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external view returns(uint256 mintAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, "invalid amount");

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        // init liquidity
        if (vault.indexTotalAmount == 0 && vault.stableTotalAmount == 0) {
            uint256 indexDesiredAmount = Math.mulDiv(_stableAmount, pair.initPairRatio, 100 * PRECISION);
            uint256 stableDesiredAmount = Math.mulDiv(_indexAmount, 100 * PRECISION, pair.initPairRatio);
            if (indexDesiredAmount <= _indexAmount) {
                _indexAmount = indexDesiredAmount;
            } else {
                _stableAmount = stableDesiredAmount;
            }
        }

        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = Math.mulDiv(_indexAmount, pair.fee.addLpFeeP, 100 * PRECISION);
            uint256 stableFeeAmount = Math.mulDiv(_stableAmount, pair.fee.addLpFeeP, 100 * PRECISION);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }
        uint256 price = indexTokenPrice[_pairIndex];
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

        // usdt value of deposit
        uint256 indexDepositDelta = _getDelta(afterFeeIndexAmount, price);

        // calculate deposit usdt value without slippage
        uint256 slipDelta;
        if (indexReserveDelta + vault.stableTotalAmount > 0) {

            // after deposit
            uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
            uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;

            // reserve: 70 30
            // deposit: 40 20
            // total:  110 50
            (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
            if (indexTotalDelta > stableTotalDelta) {
                // 60 / 2 = 30
                // 40 - 30 -> 20 + 30
                uint256 needSwapIndexDelta = (indexTotalDelta - stableTotalDelta) / 2;
                uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta ? (indexDepositDelta - needSwapIndexDelta) : indexDepositDelta;

                slipDelta =  AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                uint256 slipAmount = _getAmount(slipDelta, price);

                afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
            } else if (indexTotalDelta < stableTotalDelta) {
                uint256 needSwapStableDelta = (stableTotalDelta - indexTotalDelta) / 2;
                uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta ? (afterFeeStableAmount - needSwapStableDelta) : afterFeeStableAmount;

                slipDelta = swapStableDelta - _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);

                afterFeeStableAmount = afterFeeStableAmount - slipDelta;
            }
        }
        // mint lp
        mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex, price));
        return mintAmount;
    }

    // calculate amount for remove liquidity
    function getReceivedAmount(uint256 _pairIndex, uint256 _lpAmount) public view returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_lpAmount > 0, "invalid amount");
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = indexTokenPrice[_pairIndex];
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex, price));

        // received delta of indexToken and stableToken
        uint256 receiveIndexTokenDelta;
        uint256 receiveStableTokenDelta;
        if (indexReserveDelta > stableReserveDelta) {
            uint256 extraIndexReserveDelta = indexReserveDelta - stableReserveDelta;
            if (extraIndexReserveDelta > receiveDelta) {
                receiveIndexTokenDelta = receiveIndexTokenDelta + receiveDelta;
            } else {
                uint256 lastReceiveDelta = receiveDelta - extraIndexReserveDelta;
                receiveIndexTokenDelta = receiveIndexTokenDelta + extraIndexReserveDelta + lastReceiveDelta / 2;
                receiveStableTokenDelta = receiveStableTokenDelta + lastReceiveDelta / 2;
            }
        } else {
            uint256 extraStableReserveDelta = stableReserveDelta - indexReserveDelta;
            if (extraStableReserveDelta > receiveDelta) {
                receiveStableTokenDelta = receiveStableTokenDelta + receiveDelta;
            } else {
                uint256 lastReceiveDelta = receiveDelta - extraStableReserveDelta;
                receiveIndexTokenDelta = receiveIndexTokenDelta + lastReceiveDelta / 2;
                receiveStableTokenDelta = receiveStableTokenDelta + lastReceiveDelta / 2;
            }
        }
        receiveIndexTokenAmount = _getAmount(receiveIndexTokenDelta, price);
        receiveStableTokenAmount = receiveStableTokenDelta;
        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

}
