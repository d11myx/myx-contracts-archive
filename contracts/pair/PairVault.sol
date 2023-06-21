// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts/token/ERC20/IERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";
import "../openzeeplin/contracts/utils/Address.sol";

import "./interfaces/IPairVault.sol";
import "./interfaces/IPairStorage.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/AMMUtils.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../token/PairToken.sol";
import "../token/WETH.sol";

contract PairVault is IPairVault, Handleable {

    IPairStorage public pairStorage;

//    IVaultPriceFeed public vaultPriceFeed;

    uint256 public constant PRECISION = 1e10;
    uint256 public constant PRICE_PRECISION = 1e30;

    mapping(uint256 => Vault) public vaults;

    address public feeReceiver;

    address public slipReceiver;

    address public weth;

    struct Vault {
        uint256 indexTotalAmount;               // total amount of tokens
        uint256 indexReservedAmount;            // amount of tokens reserved for open positions
        uint256 stableTotalAmount;              //
        uint256 stableReservedAmount;           //
    }

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
        IPairStorage _pairStorage,
        address _feeReceiver,
        address _slipReceiver,
        address _weth
    ) external initializer {
        __Handleable_init();
        pairStorage = _pairStorage;
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
        weth = _weth;
    }

    function setPairStorage(IPairStorage _pairStorage) external onlyHandler {
        pairStorage = _pairStorage;
    }

    function setReceiver(address _feeReceiver, address _slipReceiver) external onlyHandler {
        feeReceiver = _feeReceiver;
        slipReceiver = _slipReceiver;
    }

    function createPair(address indexToken, address stableToken) external onlyHandler returns (address) {
        require(msg.sender == address(pairStorage), "forbid");

        bytes memory bytecode = type(PairToken).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(indexToken, stableToken));
        address pairToken;
        assembly {
            pairToken := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IPairToken(pairToken).initialize(indexToken, stableToken);
        return pairToken;
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
        if (receivedIndexAmount > 0 && pairStorage.getPair(_pairIndex).indexToken == weth) {
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

        IPairStorage.Pair memory pair = pairStorage.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        // transfer token
        IERC20(pair.indexToken).transferFrom(_funder, address(this), _indexAmount);
        IERC20(pair.stableToken).transferFrom(_funder, address(this), _stableAmount);

        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = Math.mulDiv(_indexAmount, pair.fee.depositFeeP, 100 * PRECISION);
            uint256 stableFeeAmount = Math.mulDiv(_stableAmount, pair.fee.depositFeeP, 100 * PRECISION);

            IERC20(pair.indexToken).transfer(feeReceiver, indexFeeAmount);
            IERC20(pair.stableToken).transfer(feeReceiver, stableFeeAmount);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }

        Vault storage vault = vaults[_pairIndex];
        // usdt value of reserve
        {
            // todo
//            uint256 price = vaultPriceFeed.getPrice(pair.indexToken, true, true, false);
            uint256 price = 100 * PRICE_PRECISION;

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
                if (indexTotalDelta > stableTotalDelta) {
                    // 60 / 2 = 30
                    // 40 - 30 -> 20 + 30
                    uint256 needSwapIndexDelta = (indexTotalDelta - stableTotalDelta) / 2;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta ? (indexDepositDelta - needSwapIndexDelta) : indexDepositDelta;
                    slipDelta = swapIndexDelta - _getStableTokenOut(_getAmount(swapIndexDelta, price), pair.k, price);

                    uint256 slipAmount = _getAmount(slipDelta, price);

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    IERC20(pair.indexToken).transfer(slipReceiver, slipAmount);
                } else if (indexTotalDelta < stableTotalDelta) {
                    uint256 needSwapStableDelta = (stableTotalDelta - indexTotalDelta) / 2;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta ? (afterFeeStableAmount - needSwapStableDelta) : afterFeeStableAmount;
                    slipDelta = swapStableDelta - _getDelta(_getIndexTokenOut(swapStableDelta, pair.k, price), price);

                    afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                    IERC20(pair.stableToken).transfer(slipReceiver, slipDelta);
                }
            }
            uint256 lpFairDelta = indexReserveDelta + vault.stableTotalAmount;
            uint256 lpFairPrice = IERC20(pair.pairToken).totalSupply() > 0 ? Math.mulDiv(lpFairDelta, PRICE_PRECISION, IERC20(pair.pairToken).totalSupply()) : 1 * PRICE_PRECISION;
            // mint lp
            mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice);
        }
        IPairToken(pair.pairToken).mint(_account, mintAmount);

        vault.indexTotalAmount = vault.indexTotalAmount + afterFeeIndexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + afterFeeStableAmount;

        emit AddLiquidity(_account, _pairIndex, _indexAmount, _stableAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(address _account, address _receiver, uint256 _pairIndex, uint256 _amount) private returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_amount > 0, "invalid amount");
        IPairStorage.Pair memory pair = pairStorage.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        require(IERC20(pair.pairToken).balanceOf(_account) >= _amount, "insufficient balance");

        Vault storage vault = vaults[_pairIndex];

        // usdt value of reserve todo
//        uint256 price = vaultPriceFeed.getPrice(pair.indexToken, false, true, false);
        uint256 price = 150 * PRICE_PRECISION;

        // stack too deep
        {
            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
            uint256 stableReserveDelta = vault.stableTotalAmount;
            uint256 lpFairDelta = indexReserveDelta + stableReserveDelta;

            uint256 lpFairPrice = lpFairDelta > 0 ? Math.mulDiv(lpFairDelta, PRICE_PRECISION, IERC20(pair.pairToken).totalSupply()) : 1 * PRICE_PRECISION;

            uint256 receiveDelta = _getDelta(_amount, lpFairPrice);

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
        }

        require(receiveIndexTokenAmount <= vault.indexTotalAmount - vault.indexReservedAmount, "insufficient indexToken amount");
        require(receiveStableTokenAmount <= vault.stableTotalAmount - vault.stableReservedAmount, "insufficient stableToken amount");

        vault.indexTotalAmount = vault.indexTotalAmount - receiveIndexTokenAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - receiveStableTokenAmount;

        IPairToken(pair.pairToken).burn(_account, _amount);

        IERC20(pair.indexToken).transfer(_receiver, receiveIndexTokenAmount);
        IERC20(pair.stableToken).transfer(_receiver, receiveStableTokenAmount);

        emit RemoveLiquidity(_account, _pairIndex, receiveIndexTokenAmount, receiveStableTokenAmount, _amount);

        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function _getDelta(uint256 amount, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function _getAmount(uint256 delta, uint256 price) internal view returns(uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    function _getStableTokenOut(uint256 amountA, uint256 k, uint256 price) internal view returns(uint256) {
        (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(k, price, PRICE_PRECISION);
        return AMMUtils.getAmountOut(amountA, reserveA, reserveB);
    }

    function _getIndexTokenOut(uint256 amountB, uint256 k, uint256 price) internal view returns(uint256) {
        (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(k, price, PRICE_PRECISION);
        return AMMUtils.getAmountOut(amountB, reserveB, reserveA);
    }

}
