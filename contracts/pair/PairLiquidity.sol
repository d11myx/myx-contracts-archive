// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/IWETH.sol";
import "./interfaces/IPairInfo.sol";
import "./interfaces/IPairLiquidity.sol";
import "./interfaces/IPairVault.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/AMMUtils.sol";
import "../libraries/PrecisionUtils.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "../token/PairToken.sol";

import "hardhat/console.sol";

contract PairLiquidity is IPairLiquidity, Handleable {

    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    uint256 public constant PRICE_PRECISION = 1e30;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    IVaultPriceFeed public vaultPriceFeed;

    address public feeReceiver;

    address public slipReceiver;

    address public weth;

    // pairToken => user => amount
    mapping(address => mapping(address => uint256)) public userPairTokens;

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

    constructor(
        IAddressesProvider addressProvider,
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IVaultPriceFeed _vaultPriceFeed,
        address _feeReceiver,
        address _slipReceiver,
        address _weth
    ) Handleable(addressProvider) {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        vaultPriceFeed = _vaultPriceFeed;
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
        IWETH(weth).deposit{value: msg.value}();
        IWETH(weth).transfer(msg.sender, msg.value);
        return _addLiquidity(msg.sender, msg.sender, _pairIndex, msg.value, _stableAmount);
    }

    function addLiquidityForAccount(address _funder, address _account, uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler returns (uint256) {
        return _addLiquidity(_funder, _account, _pairIndex, _indexAmount, _stableAmount);
    }

    function removeLiquidity(uint256 _pairIndex, uint256 _amount) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount) {
        (receivedIndexAmount, receivedStableAmount) = _removeLiquidity(msg.sender, msg.sender, _pairIndex, _amount);
        if (receivedIndexAmount > 0 && pairInfo.getPair(_pairIndex).indexToken == weth) {
            IWETH(weth).withdraw(receivedIndexAmount);
            payable(msg.sender).sendValue(receivedIndexAmount);
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

        console.log("addLiquidity indexAmount", _indexAmount, "stableAmount", _stableAmount);
        // transfer token
        IERC20(pair.indexToken).safeTransferFrom(_funder, address(this), _indexAmount);
        IERC20(pair.stableToken).safeTransferFrom(_funder, address(this), _stableAmount);

        // fee
        uint256 afterFeeIndexAmount;
        uint256 afterFeeStableAmount;

        {
            // transfer fee
            uint256 indexFeeAmount = _indexAmount.mulPercentage(pair.addLpFeeP);
            uint256 stableFeeAmount = _stableAmount.mulPercentage(pair.addLpFeeP);
            console.log("addLiquidity indexFeeAmount", indexFeeAmount, "stableFeeAmount", stableFeeAmount);

            IERC20(pair.indexToken).safeTransfer(feeReceiver, indexFeeAmount);
            IERC20(pair.stableToken).safeTransfer(feeReceiver, stableFeeAmount);

            afterFeeIndexAmount = _indexAmount - indexFeeAmount;
            afterFeeStableAmount = _stableAmount - stableFeeAmount;
        }

        // usdt value of reserve
        {
            uint256 price = _getPrice(pair.indexToken);
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
                console.log("addLiquidity indexTotalDelta", indexTotalDelta, "stableTotalDelta", stableTotalDelta);

                // expect delta
                uint256 expectIndexDelta = (indexTotalDelta + stableTotalDelta).mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = (indexTotalDelta + stableTotalDelta).mulPercentage(PrecisionUtils.oneHundredPercentage() - pair.expectIndexTokenP);
                console.log("addLiquidity expectIndexDelta", expectIndexDelta, "expectStableDelta", expectStableDelta);

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta ? (indexDepositDelta - needSwapIndexDelta) : indexDepositDelta;
                    console.log("addLiquidity needSwapIndexDelta", needSwapIndexDelta, "swapIndexDelta", swapIndexDelta);

                    slipDelta =  AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    uint256 slipAmount = _getAmount(slipDelta, price);

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    IERC20(pair.indexToken).safeTransfer(slipReceiver, slipAmount);
                    console.log("addLiquidity slipDelta", slipDelta, "afterFeeIndexAmount", afterFeeIndexAmount);
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta ? (afterFeeStableAmount - needSwapStableDelta) : afterFeeStableAmount;
                    console.log("addLiquidity needSwapStableDelta", needSwapStableDelta, "swapStableDelta", swapStableDelta);

                    slipDelta = swapStableDelta - _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);

                    afterFeeStableAmount = afterFeeStableAmount - slipDelta;
                    IERC20(pair.stableToken).safeTransfer(slipReceiver, slipDelta);
                    console.log("addLiquidity slipDelta", slipDelta, "afterFeeStableAmount", afterFeeStableAmount);
                }
            }
            // mint lp
            mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));
            console.log("addLiquidity indexDepositDelta", indexDepositDelta, "afterFeeStableAmount", afterFeeStableAmount);
        }
        IPairToken(pair.pairToken).mint(address(this), mintAmount);
        userPairTokens[pair.pairToken][_account] = userPairTokens[pair.pairToken][_account] + mintAmount;

        pairVault.increaseTotalAmount(_pairIndex, afterFeeIndexAmount, afterFeeStableAmount);

        IERC20(pair.indexToken).safeTransfer(address(pairVault), afterFeeIndexAmount);
        IERC20(pair.stableToken).safeTransfer(address(pairVault), afterFeeStableAmount);
        console.log("addLiquidity afterFeeIndexAmount", afterFeeIndexAmount, "afterFeeStableAmount", afterFeeStableAmount);

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

    function lpFairPrice(uint256 _pairIndex) public view returns(uint256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);
        uint256 price = _getPrice(pair.indexToken);
        uint256 lpFairDelta = _getDelta(vault.indexTotalAmount, price) + vault.stableTotalAmount;
        return lpFairDelta > 0 ? Math.mulDiv(lpFairDelta, PRICE_PRECISION, IERC20(pair.pairToken).totalSupply()) : 1 * PRICE_PRECISION;
    }

    function _getDelta(uint256 amount, uint256 price) internal pure returns(uint256) {
        return Math.mulDiv(amount, price, PRICE_PRECISION);
    }

    function _getAmount(uint256 delta, uint256 price) internal pure returns(uint256) {
        return Math.mulDiv(delta, PRICE_PRECISION, price);
    }

    // calculate lp amount for add liquidity
    function getMintLpAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external view returns(uint256 mintAmount, address slipToken, uint256 slipAmount) {
        require(_indexAmount > 0 || _stableAmount > 0, "invalid amount");

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        console.log("getMintLpAmount indexAmount", _indexAmount, "stableAmount", _stableAmount);

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
        require(price > 0, "invalid price");

        // calculate deposit usdt value without slippage
        uint256 slipDelta;

        // usdt value of deposit
        uint256 indexDepositDelta = _getDelta(afterFeeIndexAmount, price);
        console.log("getMintLpAmount indexDepositDelta", indexDepositDelta);

        {
            uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);

            if (indexReserveDelta + vault.stableTotalAmount > 0) {

                // after deposit
                uint256 indexTotalDelta = indexReserveDelta + indexDepositDelta;
                uint256 stableTotalDelta = vault.stableTotalAmount + afterFeeStableAmount;
                console.log("getMintLpAmount indexTotalDelta", indexTotalDelta, "stableTotalDelta", stableTotalDelta);

                uint256 expectIndexDelta = (indexTotalDelta + stableTotalDelta).mulPercentage(pair.expectIndexTokenP);
                uint256 expectStableDelta = (indexTotalDelta + stableTotalDelta).mulPercentage(PrecisionUtils.oneHundredPercentage() - pair.expectIndexTokenP);
                console.log("getMintLpAmount expectIndexDelta", expectIndexDelta, "expectStableDelta", expectStableDelta);

                (uint256 reserveA, uint256 reserveB) = AMMUtils.getReserve(pair.kOfSwap, price, PRICE_PRECISION);
                if (indexTotalDelta > expectIndexDelta) {
                    uint256 needSwapIndexDelta = indexTotalDelta - expectIndexDelta;
                    uint256 swapIndexDelta = indexDepositDelta > needSwapIndexDelta ? (indexDepositDelta - needSwapIndexDelta) : indexDepositDelta;
                    console.log("getMintLpAmount needSwapIndexDelta", needSwapIndexDelta, "swapIndexDelta", swapIndexDelta);

                    slipDelta =  AMMUtils.getAmountOut(_getAmount(swapIndexDelta, price), reserveA, reserveB);
                    slipAmount = _getAmount(slipDelta, price);
                    slipToken = pair.indexToken;

                    afterFeeIndexAmount = afterFeeIndexAmount - slipAmount;
                    console.log("getMintLpAmount slipDelta", slipDelta, "afterFeeIndexAmount", afterFeeIndexAmount);
                } else if (stableTotalDelta > expectStableDelta) {
                    uint256 needSwapStableDelta = stableTotalDelta - expectStableDelta;
                    uint256 swapStableDelta = afterFeeStableAmount > needSwapStableDelta ? (afterFeeStableAmount - needSwapStableDelta) : afterFeeStableAmount;
                    console.log("getMintLpAmount needSwapStableDelta", needSwapStableDelta, "swapStableDelta", swapStableDelta);

                    slipDelta = swapStableDelta - _getDelta(AMMUtils.getAmountOut(swapStableDelta, reserveB, reserveA), price);
                    slipAmount = slipDelta;
                    slipToken = pair.stableToken;

                    afterFeeStableAmount = afterFeeStableAmount - slipAmount;
                    console.log("getMintLpAmount slipDelta", slipDelta, "afterFeeStableAmount", afterFeeStableAmount);
                }
            }
        }
        console.log("getMintLpAmount afterFeeIndexAmount", afterFeeIndexAmount, "afterFeeStableAmount", afterFeeStableAmount);
        // mint lp
        mintAmount = _getAmount(indexDepositDelta + afterFeeStableAmount - slipDelta, lpFairPrice(_pairIndex));
        console.log("getMintLpAmount indexDepositDelta", indexDepositDelta, "afterFeeStableAmount", afterFeeStableAmount);
        return (mintAmount, slipToken, slipAmount);
    }

    // calculate deposit amount for add liquidity
    function getDepositAmount(uint256 _pairIndex, uint256 _lpAmount) external view returns(uint256 depositIndexAmount, uint256 depositStableAmount) {
        require(_lpAmount > 0, "invalid amount");
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;
        uint256 depositDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));
        console.log("getMintLpAmount depositDelta", depositDelta);

        // expect delta
        uint256 expectIndexDelta = (indexReserveDelta + stableReserveDelta + depositDelta).mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = (indexReserveDelta + stableReserveDelta + depositDelta).mulPercentage(PrecisionUtils.oneHundredPercentage() - pair.expectIndexTokenP);
        console.log("getDepositAmount expectIndexDelta", expectIndexDelta, "expectStableDelta", expectStableDelta);

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
            console.log("getDepositAmount depositIndexTokenDelta", depositIndexTokenDelta, "depositStableTokenDelta", depositStableTokenDelta);
        } else {
            uint256 extraStableReserveDelta = expectStableDelta - stableReserveDelta;
            if (extraStableReserveDelta >= depositDelta) {
                depositStableTokenDelta = depositDelta;
            } else {
                depositIndexTokenDelta = depositDelta - extraStableReserveDelta;
                depositStableTokenDelta = extraStableReserveDelta;
            }
            console.log("getDepositAmount depositIndexTokenDelta", depositIndexTokenDelta, "depositStableTokenDelta", depositStableTokenDelta);
        }
        depositIndexAmount = _getAmount(depositIndexTokenDelta, price);
        depositStableAmount = depositStableTokenDelta;
        console.log("getDepositAmount depositIndexAmount", depositIndexAmount, "depositStableAmount", depositStableAmount);

        // add fee
        depositIndexAmount = depositIndexAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);
        depositStableAmount = depositStableAmount.divPercentage(PrecisionUtils.oneHundredPercentage() - pair.addLpFeeP);
        console.log("getDepositAmount depositIndexAmount", depositIndexAmount, "depositStableAmount", depositStableAmount);
        return (depositIndexAmount, depositStableAmount);
    }

    // calculate amount for remove liquidity
    function getReceivedAmount(uint256 _pairIndex, uint256 _lpAmount) public view returns (uint256 receiveIndexTokenAmount, uint256 receiveStableTokenAmount) {
        require(_lpAmount > 0, "invalid amount");
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.pairToken != address(0), "invalid pair");

        IPairVault.Vault memory vault = pairVault.getVault(_pairIndex);

        // usdt value of reserve
        uint256 price = _getPrice(pair.indexToken);
        require(price > 0, "invalid price");

        uint256 indexReserveDelta = _getDelta(vault.indexTotalAmount, price);
        uint256 stableReserveDelta = vault.stableTotalAmount;

        uint256 receiveDelta = _getDelta(_lpAmount, lpFairPrice(_pairIndex));
        console.log("getReceivedAmount receiveDelta", receiveDelta);

        // expect delta
        uint256 expectIndexDelta = (indexReserveDelta + stableReserveDelta - receiveDelta).mulPercentage(pair.expectIndexTokenP);
        uint256 expectStableDelta = (indexReserveDelta + stableReserveDelta - receiveDelta).mulPercentage(PrecisionUtils.oneHundredPercentage() - pair.expectIndexTokenP);
        console.log("getReceivedAmount expectIndexDelta", expectIndexDelta, "expectStableDelta", expectStableDelta);

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
            console.log("getReceivedAmount receiveIndexTokenDelta", receiveIndexTokenDelta, "receiveStableTokenDelta", receiveStableTokenDelta);
        } else {
            uint256 extraStableReserveDelta = stableReserveDelta - expectStableDelta;
            if (extraStableReserveDelta >= receiveDelta) {
                receiveStableTokenDelta = receiveDelta;
            } else {
                receiveIndexTokenDelta = receiveDelta - extraStableReserveDelta;
                receiveStableTokenDelta = extraStableReserveDelta;
            }
            console.log("getReceivedAmount receiveIndexTokenDelta", receiveIndexTokenDelta, "receiveStableTokenDelta", receiveStableTokenDelta);
        }
        receiveIndexTokenAmount = _getAmount(receiveIndexTokenDelta, price);
        receiveStableTokenAmount = receiveStableTokenDelta;
        console.log("getReceivedAmount receiveIndexTokenAmount", receiveIndexTokenAmount, "receiveStableTokenAmount", receiveStableTokenAmount);
        return (receiveIndexTokenAmount, receiveStableTokenAmount);
    }

    function _getPrice(address _token) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token);
    }
}
