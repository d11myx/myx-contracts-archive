// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./interfaces/ITradingUtils.sol";
import "./interfaces/ITradingRouter.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "./interfaces/ITradingVault.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../libraries/access/Governable.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/PrecisionUtils.sol";

contract TradingUtils is ITradingUtils, Governable {
    using Int256Utils for int256;
    using PrecisionUtils for uint256;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IVaultPriceFeed public vaultPriceFeed;

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IVaultPriceFeed _vaultPriceFeed,
        uint256 _maxTimeDelay
    ) external initializer {
        __Governable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingVault _tradingVault,
        ITradingRouter _tradingRouter,
        IVaultPriceFeed _vaultPriceFeed
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingVault = _tradingVault;
        tradingRouter = _tradingRouter;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function getOrderKey(bool _isIncrease, ITradingRouter.TradeType _tradeType, uint256 _orderId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_isIncrease, _tradeType, _orderId));
    }

    function getPrice(uint256 _pairIndex, bool _isLong) public view returns (uint256) {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        return vaultPriceFeed.getPrice(pair.indexToken, _isLong ? true : false, false, false);
    }

    function validLeverage(bytes32 key, int256 _collateral, uint256 _sizeAmount, bool _increase) public {
        ITradingVault.Position memory position = tradingVault.getPositionByKey(key);
        uint256 price = getPrice(position.pairIndex, position.isLong);

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);

        require(_increase ? true : position.positionAmount >= _sizeAmount, "decrease amount exceed position");

        uint256 afterPosition = _increase ? position.positionAmount + _sizeAmount : position.positionAmount - _sizeAmount;
        int256 totalCollateral = int256(position.collateral) + _collateral;
        require(totalCollateral >= 0, "collateral not enough for decrease");
        totalCollateral += tradingVault.getUnrealizedPnl(position.account, position.pairIndex, position.isLong, _sizeAmount);

        require(totalCollateral >= 0, "collateral not enough for pnl");
        require(afterPosition >= totalCollateral.abs().divPrice(price) * tradingConfig.minLeverage
            && afterPosition <= totalCollateral.abs().divPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");
    }

}
