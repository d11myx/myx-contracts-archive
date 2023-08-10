// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../libraries/Roleable.sol';
import '../libraries/AMMUtils.sol';
import '../libraries/PrecisionUtils.sol';
import '../interfaces/IOraclePriceFeed.sol';
import '../token/PairToken.sol';
import '../interfaces/IWETH.sol';

import './interfaces/IPairInfo.sol';
import './interfaces/IPairVault.sol';
import 'hardhat/console.sol';
import '../libraries/Int256Utils.sol';

contract PairVault is IPairVault, Roleable {
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;

    IPairInfo public pairInfo;
    address public pairLiquidity;
    address public pairVault;
    address public tradingVault;

    mapping(uint256 => Vault) public vaults;

    constructor(IAddressesProvider addressProvider, IPairInfo _pairInfo) Roleable(addressProvider) {
        pairInfo = _pairInfo;
    }

    modifier onlyPairLiquidityAndVault() {
        require(msg.sender == pairLiquidity || msg.sender == pairVault || msg.sender == tradingVault, 'forbidden');
        _;
    }

    function setPairLiquidityAndVault(address _pairLiquidity, address _pairVaule) external onlyPoolAdmin {
        pairLiquidity = _pairLiquidity;
        pairVault = _pairVaule;
    }

    modifier onlyTradingVault() {
        require(msg.sender == tradingVault, 'forbidden');
        _;
    }

    function setTradingVault(address _tradingVault) external onlyPoolAdmin {
        tradingVault = _tradingVault;
    }

    function setPairInfo(IPairInfo _pairInfo) external onlyPoolAdmin {
        pairInfo = _pairInfo;
    }

    function increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        console.log(
            'increaseTotalAmount before indexTotalAmount',
            vault.indexTotalAmount,
            'stableTotalAmount',
            vault.stableTotalAmount
        );
        console.log('increaseTotalAmount _indexAmount', _indexAmount, '_stableAmount', _stableAmount);
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
        console.log(
            'increaseTotalAmount after indexTotalAmount',
            vault.indexTotalAmount,
            'stableTotalAmount',
            vault.stableTotalAmount
        );
    }

    function decreaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        console.log(
            'decreaseTotalAmount before indexTotalAmount',
            vault.indexTotalAmount,
            'stableTotalAmount',
            vault.stableTotalAmount
        );
        console.log('decreaseTotalAmount _indexAmount', _indexAmount, '_stableAmount', _stableAmount);
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
        console.log(
            'decreaseTotalAmount after indexTotalAmount',
            vault.indexTotalAmount,
            'stableTotalAmount',
            vault.stableTotalAmount
        );
    }

    function increaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        console.log(
            'increaseReserveAmount before indexReservedAmount',
            vault.indexReservedAmount,
            'stableReservedAmount',
            vault.stableReservedAmount
        );
        console.log('increaseReserveAmount _indexAmount', _indexAmount, '_stableAmount', _stableAmount);
        vault.indexReservedAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount + _stableAmount;
        console.log(
            'increaseReserveAmount after indexReservedAmount',
            vault.indexReservedAmount,
            'stableReservedAmount',
            vault.stableReservedAmount
        );
    }

    function decreaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        console.log(
            'decreaseReserveAmount before indexReservedAmount',
            vault.indexReservedAmount,
            'stableReservedAmount',
            vault.stableReservedAmount
        );
        console.log('decreaseReserveAmount _indexAmount', _indexAmount, '_stableAmount', _stableAmount);
        vault.indexReservedAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount - _stableAmount;
        console.log(
            'decreaseReserveAmount after indexReservedAmount',
            vault.indexReservedAmount,
            'stableReservedAmount',
            vault.stableReservedAmount
        );
    }

    function transferTokenTo(address token, address to, uint256 amount) external onlyPairLiquidityAndVault {
        IERC20(token).safeTransfer(to, amount);
    }

    function getVault(uint256 _pairIndex) external view returns (Vault memory vault) {
        return vaults[_pairIndex];
    }

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external onlyPairLiquidityAndVault {
        console.log('updateAveragePrice _pairIndex', _pairIndex, '_averagePrice', _averagePrice);
        vaults[_pairIndex].averagePrice = _averagePrice;
    }

    function increaseProfit(uint256 _pairIndex, uint256 _profit) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        console.log('increaseProfit _pairIndex', _pairIndex, '_profit', _profit);
        console.log(
            'increaseProfit indexTotalAmount',
            vault.indexTotalAmount,
            'indexReservedAmount',
            vault.indexReservedAmount
        );
        console.log(
            'increaseProfit indexToken balance',
            IERC20(pairInfo.getPair(_pairIndex).indexToken).balanceOf(address(this)),
            'stableToken balance',
            IERC20(pairInfo.getPair(_pairIndex).stableToken).balanceOf(address(this))
        );
        vault.stableTotalAmount += _profit;
        vault.realisedPnl += int256(_profit);
        console.log(
            'decreaseReserveAmount after stableTotalAmount',
            vault.stableTotalAmount,
            'realisedPnl',
            vault.realisedPnl.toString()
        );
    }

    function decreaseProfit(
        uint256 _pairIndex,
        uint256 _profit
    ) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        console.log('decreaseProfit _pairIndex', _pairIndex, '_profit', _profit);
        console.log(
            'decreaseProfit indexTotalAmount',
            vault.indexTotalAmount,
            'indexReservedAmount',
            vault.indexReservedAmount
        );
        console.log(
            'decreaseProfit indexToken balance',
            IERC20(pairInfo.getPair(_pairIndex).indexToken).balanceOf(address(this)),
            'stableToken balance',
            IERC20(pairInfo.getPair(_pairIndex).stableToken).balanceOf(address(this))
        );
        uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

        console.log('decreaseProfit availableStable', availableStable);
        require(_profit <= availableStable, 'stable token not enough');

        IERC20(pairInfo.getPair(_pairIndex).stableToken).safeTransfer(msg.sender, _profit);
        vault.stableTotalAmount -= _profit;
        vault.realisedPnl -= int256(_profit);
        console.log(
            'decreaseProfit after stableTotalAmount %s indexTotalAmount %s realisedPnl %s',
            vault.stableTotalAmount,
            vault.indexTotalAmount,
            vault.realisedPnl.toString()
        );
    }

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _amountOut
    ) external onlyPairLiquidityAndVault {
        console.log('swap pairIndex %s buyIndexToken %s', _pairIndex, _isBuy);
        console.log('swap pairIndex %s amountIn %s amountOut %s', _amountIn, _amountOut);

        Vault memory vault = vaults[_pairIndex];
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);

        if (_isBuy) {
            uint256 availableIndex = vault.indexTotalAmount - vault.indexReservedAmount;
            console.log('swap amountOut indexToken %s availableIndex %s', _amountOut, availableIndex);
            require(_amountOut <= availableIndex, 'swap index token not enough');

            this.increaseTotalAmount(_pairIndex, 0, _amountIn);
            this.decreaseTotalAmount(_pairIndex, _amountOut, 0);
        } else {
            uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;
            console.log('swap amountOut stableToken %s availableStable %s', _amountOut, availableStable);
            require(_amountOut <= availableStable, 'swap stable token not enough');

            this.increaseTotalAmount(_pairIndex, _amountIn, 0);
            this.decreaseTotalAmount(_pairIndex, 0, _amountOut);
        }
    }
}
