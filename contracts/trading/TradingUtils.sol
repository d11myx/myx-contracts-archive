// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/Position.sol";
import "./interfaces/ITradingUtils.sol";
import "./interfaces/ITradingRouter.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "./interfaces/ITradingVault.sol";
import "../interfaces/IVaultPriceFeed.sol";
import "../libraries/access/Governable.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/PositionKey.sol";
import "hardhat/console.sol";

contract TradingUtils is ITradingUtils, Governable {
    using Math for uint256;
    using Int256Utils for int256;
    using PrecisionUtils for uint256;
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;


    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingVault public tradingVault;
    ITradingRouter public tradingRouter;
    IVaultPriceFeed public vaultPriceFeed;

    function initialize() external initializer {
        __Governable_init();
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

    function getPrice(address indexToken) public view returns (uint256) {
        // IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = vaultPriceFeed.getPrice(indexToken);
        // console.log("getPrice pairIndex %s isLong %s price %s", _pairIndex, _isLong, price);
        return price;
    }

    function validLeverage(
        address account,
        uint256 pairIndex,
        bool isLong,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _increase
    ) public view returns (uint256, uint256) {
        console.log("validLeverage sizeAmount", _sizeAmount, "collateral", _collateral.toString());

        bytes32 key = PositionKey.getPositionKey(account, pairIndex, isLong);
        Position.Info memory position = tradingVault.getPositionByKey(key);
        IPairInfo.Pair memory pair = pairInfo.getPair(pairIndex);
        uint256 price = getPrice(pair.indexToken);

        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(position.pairIndex);
        // position >= decrease size
        require(_increase ? true : position.positionAmount >= _sizeAmount, "decrease amount exceed position");

        uint256 afterPosition = _increase ? position.positionAmount + _sizeAmount : position.positionAmount - _sizeAmount;

        // close position
        if (afterPosition == 0) {
            return (0, 0);
        }

        // check collateral
        int256 totalCollateral = int256(position.collateral) + _collateral;
        require(totalCollateral >= 0, "collateral not enough for decrease");

        // pnl
        if (position.positionAmount > 0) {
            uint256 price = getPrice(pair.indexToken);
            totalCollateral += position.getUnrealizedPnl(position.positionAmount,price);
        }

        console.log("validLeverage totalCollateral", totalCollateral.toString());
        require(totalCollateral >= 0, "collateral not enough for pnl");

        console.log("validLeverage afterPosition", afterPosition, "collateralDelta", totalCollateral.abs().divPrice(price));
        require(afterPosition >= totalCollateral.abs().divPrice(price) * tradingConfig.minLeverage
            && afterPosition <= totalCollateral.abs().divPrice(price) * tradingConfig.maxLeverage, "leverage incorrect");
        require(afterPosition <= tradingConfig.maxPositionAmount, "exceed max position");

        return (afterPosition, totalCollateral.abs());
    }

}
