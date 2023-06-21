// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts/token/ERC20/IERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";
import "../openzeeplin/contracts/utils/Address.sol";

import "./interfaces/IPairVault.sol";
import "../libraries/access/Handleable.sol";
import "../libraries/AMMUtils.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../token/PairToken.sol";
import "../token/WETH.sol";

contract PairVault is IPairVault, Handleable {

    mapping(uint256 => Vault) public vaults;

    function initialize() external initializer {
        __Handleable_init();
    }

    function increaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
    }

    function decreaseTotalAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
    }

    function increaseReserveAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableReservedAmount + _stableAmount;
    }

    function decreaseReserveAmount(uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external onlyHandler {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableReservedAmount - _stableAmount;
    }

    function transferTokenTo(address token, address to, uint256 amount) external onlyHandler {
        IERC20(token).transfer(to, amount);
    }

    function getVault(uint256 _pairIndex) external view returns(Vault memory vault) {
        return vaults[_pairIndex];
    }

}
