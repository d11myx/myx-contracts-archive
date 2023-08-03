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

    // function getPrice(address indexToken) public view returns (uint256) {
    //     // IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
    //     uint256 price = vaultPriceFeed.getPrice(indexToken);
    //     // console.log("getPrice pairIndex %s isLong %s price %s", _pairIndex, _isLong, price);
    //     return price;
    // }


}
