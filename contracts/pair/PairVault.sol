// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../libraries/access/Handleable.sol";
import "../libraries/AMMUtils.sol";
import "../libraries/PrecisionUtils.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "../token/PairToken.sol";
import "../interfaces/IWETH.sol";

import "./interfaces/IPairInfo.sol";
import "./interfaces/IPairVault.sol";
import "hardhat/console.sol";
import "../libraries/Int256Utils.sol";

contract PairVault is IPairVault, Handleable {

    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;

    IPairInfo public pairInfo;

    mapping(uint256 => Vault) public vaults;

    function initialize(IPairInfo _pairInfo) external initializer {
        __Handleable_init();
        pairInfo = _pairInfo;
    }

    function setPairInfo(IPairInfo _pairInfo) external onlyGov {
        pairInfo = _pairInfo;
    }

    function increaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("increaseTotalAmount before indexTotalAmount", vault.indexTotalAmount, "stableTotalAmount", vault.stableTotalAmount);
        console.log("increaseTotalAmount _indexAmount", _indexAmount, "_stableAmount", _stableAmount);
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
        console.log("increaseTotalAmount after indexTotalAmount", vault.indexTotalAmount, "stableTotalAmount", vault.stableTotalAmount);
    }

    function decreaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("decreaseTotalAmount before indexTotalAmount", vault.indexTotalAmount, "stableTotalAmount", vault.stableTotalAmount);
        console.log("decreaseTotalAmount _indexAmount", _indexAmount, "_stableAmount", _stableAmount);
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
        console.log("decreaseTotalAmount after indexTotalAmount", vault.indexTotalAmount, "stableTotalAmount", vault.stableTotalAmount);
    }

    function increaseReserveAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("increaseReserveAmount before indexReservedAmount", vault.indexReservedAmount, "stableReservedAmount", vault.stableReservedAmount);
        console.log("increaseReserveAmount _indexAmount", _indexAmount, "_stableAmount", _stableAmount);
        vault.indexReservedAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount + _stableAmount;
        console.log("increaseReserveAmount after indexReservedAmount", vault.indexReservedAmount, "stableReservedAmount", vault.stableReservedAmount);
    }

    function decreaseReserveAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("decreaseReserveAmount before indexReservedAmount", vault.indexReservedAmount, "stableReservedAmount", vault.stableReservedAmount);
        console.log("decreaseReserveAmount _indexAmount", _indexAmount, "_stableAmount", _stableAmount);
        vault.indexReservedAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount - _stableAmount;
        console.log("decreaseReserveAmount after indexReservedAmount", vault.indexReservedAmount, "stableReservedAmount", vault.stableReservedAmount);
    }

    function transferTokenTo(address token, address to, uint256 amount) external onlyHandler {
        IERC20(token).safeTransfer(to, amount);
    }

    function getVault(uint256 _pairIndex) external view returns(Vault memory vault) {
        return vaults[_pairIndex];
    }

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external onlyHandler {
        console.log("updateAveragePrice _pairIndex", _pairIndex, "_averagePrice", _averagePrice);
        vaults[_pairIndex].averagePrice = _averagePrice;
    }

    function increaseProfit(uint256 _pairIndex, uint256 _profit) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("increaseProfit _pairIndex", _pairIndex, "_profit", _profit);
        console.log("increaseProfit indexTotalAmount", vault.indexTotalAmount, "indexReservedAmount", vault.indexReservedAmount);
        console.log("increaseProfit indexToken balance", IERC20(pairInfo.getPair(_pairIndex).indexToken).balanceOf(address(this)),
            "stableToken balance", IERC20(pairInfo.getPair(_pairIndex).stableToken).balanceOf(address(this)));
        vault.stableTotalAmount += _profit;
        vault.realisedPnl += int256(_profit);
        console.log("decreaseReserveAmount after stableTotalAmount", vault.stableTotalAmount, "realisedPnl", vault.realisedPnl.toString());
    }

    function decreaseProfit(uint256 _pairIndex, uint256 _profit, uint256 _price) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        console.log("decreaseProfit _pairIndex", _pairIndex, "_profit", _profit);
        console.log("decreaseProfit indexTotalAmount", vault.indexTotalAmount, "indexReservedAmount", vault.indexReservedAmount);
        console.log("increaseProfit indexToken balance", IERC20(pairInfo.getPair(_pairIndex).indexToken).balanceOf(address(this)),
            "stableToken balance", IERC20(pairInfo.getPair(_pairIndex).stableToken).balanceOf(address(this)));
        uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;
        if (_profit <= availableStable) {
            IERC20(pairInfo.getPair(_pairIndex).stableToken).safeTransfer(msg.sender, _profit);
            vault.stableTotalAmount -= _profit;
        } else {
            IERC20(pairInfo.getPair(_pairIndex).stableToken).safeTransfer(msg.sender, availableStable);
            vault.stableTotalAmount -= availableStable;

            uint256 diffIndexAmount = (_profit - availableStable).divPrice(_price);
            IERC20(pairInfo.getPair(_pairIndex).stableToken).safeTransfer(msg.sender, diffIndexAmount);
            vault.indexTotalAmount -= diffIndexAmount;
        }
        vault.realisedPnl -= int256(_profit);
        console.log("decreaseReserveAmount after stableTotalAmount %s indexTotalAmount %s realisedPnl %s",
            vault.stableTotalAmount, vault.indexTotalAmount, vault.realisedPnl.toString());
    }

}
