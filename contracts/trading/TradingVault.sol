// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingVault.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/access/Handleable.sol";
import "../pair/interfaces/IPairVault.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "hardhat/console.sol";

contract TradingVault is ReentrancyGuardUpgradeable, ITradingVault, Handleable {
    using PrecisionUtils for uint256;
    struct Position {
        address account;
        uint256 pairIndex;
        bool isLong;
        uint256 collateral;
        uint256 positionAmount;
        uint256 averagePrice;
        uint256 entryFundingRate;
    }

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    IVaultPriceFeed public vaultPriceFeed;

    mapping (bytes32 => Position) public positions;

    mapping(address => bool) public override isFrozen;

    mapping(uint256 => int256) public override netExposureAmountChecker;
    mapping(uint256 => int256) public override longShortTracker;

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IVaultPriceFeed _vaultPriceFeed
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _collateral,
        uint256 _sizeDelta,
        bool _isLong
    ) external onlyHandler nonReentrant {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.enable, "trade pair not supported");

        uint256 price = _getPrice(pair.indexToken, _isLong);

        // check reserve
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
        require(_sizeDelta >= tradingConfig.minSize && _sizeDelta <= tradingConfig.maxSize, "invalid size");
        uint256 sizeAmount = _sizeDelta.getAmountByPrice(price);

        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);

        int256 preNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
        netExposureAmountChecker[_pairIndex] = netExposureAmountChecker[_pairIndex] + (_isLong ? int256(sizeAmount) : -int256(sizeAmount));
        console.log("increasePosition preNetExposureAmountChecker",
            preNetExposureAmountChecker > 0 ? uint256(preNetExposureAmountChecker) : uint256(-preNetExposureAmountChecker));
        if (preNetExposureAmountChecker >= 0) {
            // 偏向多头
            if (_isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                console.log("increasePosition sizeAmount", sizeAmount, "availableIndex", availableIndex);
                require(sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                console.log("increasePosition sizeAmount", sizeAmount, "availableStable", availableStable);
                require(sizeAmount <= uint256(preNetExposureAmountChecker) + availableStable.getAmountByPrice(price), "lp stable token not enough");
            }
        } else {
            // 偏向空头
            if (_isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(sizeAmount <= uint256(-preNetExposureAmountChecker) + availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(sizeAmount <= availableStable.getAmountByPrice(price), "lp stable token not enough");
            }
        }

        // get position
        bytes32 key = getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[key];
        position.collateral = position.collateral + _collateral;
        position.positionAmount = position.positionAmount + sizeAmount;

        // 修改价格
        if (position.positionAmount == 0) {
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = price;
        }

        if (position.positionAmount > 0 && _sizeDelta > 0) {
            position.averagePrice = (position.positionAmount * position.averagePrice + _sizeDelta) / (position.positionAmount + sizeAmount);
        }

        // 修改多空头
        int256 prevLongShortTracker = longShortTracker[_pairIndex];
        longShortTracker[_pairIndex] = prevLongShortTracker + (_isLong ? int256(sizeAmount) : -int256(sizeAmount));
        console.log("increasePosition prevLongShortTracker", prevLongShortTracker > 0 ? uint256(prevLongShortTracker) : uint256(-prevLongShortTracker));
        console.log("increasePosition sizeAmount", sizeAmount);
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker[_pairIndex] > prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, sizeAmount, 0);
            } else if (longShortTracker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, sizeAmount, 0);
            } else {
                // 多头转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevLongShortTracker), 0);
                pairVault.increaseReserveAmount(_pairIndex, 0, (sizeAmount - uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else if (prevLongShortTracker < 0) {
            // 空头偏移增加
            if (longShortTracker[_pairIndex] < prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, 0, _sizeDelta);
            } else if (longShortTracker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, _sizeDelta);
            } else {
                // 空头转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(-prevLongShortTracker).getAmountByPrice(price));
                pairVault.increaseReserveAmount(_pairIndex, 0, (sizeAmount + uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else {
            // 原有偏移为0
            if (longShortTracker[_pairIndex] > 0) {
                pairVault.increaseReserveAmount(_pairIndex, sizeAmount, 0);
            } else {
                pairVault.increaseReserveAmount(_pairIndex, 0, _sizeDelta);
            }
        }

        // 修改LP仓位平均价格
        if (prevLongShortTracker > 0) {
            if (_isLong) {
                uint256 averagePrice = (lpVault.averagePrice * uint256(prevLongShortTracker) + _sizeDelta) / (uint256(prevLongShortTracker) + sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else {
                if (price > position.averagePrice) {
                    uint256 profit = sizeAmount.getDeltaByPrice(price - position.averagePrice);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = sizeAmount.getDeltaByPrice(position.averagePrice - price);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            }
        } else {
            if (_isLong) {
                if (price > position.averagePrice) {
                    uint256 profit = sizeAmount.getDeltaByPrice(price - position.averagePrice);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = sizeAmount.getDeltaByPrice(position.averagePrice - price);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                uint256 averagePrice = (lpVault.averagePrice * uint256(-prevLongShortTracker) + _sizeDelta) / (uint256(-prevLongShortTracker) + sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            }
        }

    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IVaultPriceFeed _vaultPriceFeed
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        vaultPriceFeed = _vaultPriceFeed;
    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
