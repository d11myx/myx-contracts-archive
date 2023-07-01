// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "./interfaces/ITradingVault.sol";
import "../openzeeplin/contracts/security/ReentrancyGuard.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/access/Handleable.sol";
import "../pair/interfaces/IPairVault.sol";
import "../price/interfaces/IVaultPriceFeed.sol";

contract TradingVault is ReentrancyGuard, ITradingVault, Handleable {
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

    address public tradingFeeReceiver;

    mapping(uint256 => int256) public override netExposureAmountChecker;
    mapping(uint256 => int256) public override longShortTracker;


    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _collateral,
        uint256 _sizeDelta,
        bool _isLong
    ) external isHandler nonReentrant {
        IPairInfo.Pair pair = pairInfo.getPair(pairIndex);
        require(pair.enable, "trade pair not supported");

        uint256 price = _getPrice(pairIndex);

        // check reserve
        uint256 sizeAmount = _sizeDelta.getAmountByPrice(price);

        if (netExposureAmountChecker >= 0) {
            // 偏向多头
            if (request.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(sizeAmount <= availableIndex, "lp index token not enough");
            } else {
                uint256 availableStable = lpVault.stableTotalAmount - lpVault.stableReservedAmount;
                require(sizeAmount <= netExposureAmountChecker + availableStable.getAmountByPrice(price), "lp stable token not enough");
                tradingFee = request.positionDelta.mulPercentage(fee.makerFeeP);
            }
        } else {
            // 偏向空头
            if (request.isLong) {
                uint256 availableIndex = lpVault.indexTotalAmount - lpVault.indexReservedAmount;
                require(sizeAmount <= - netExposureAmountChecker + availableIndex, "lp index token not enough");
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
        if (position.size == 0) {
            position.account = _pairIndex;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = price;
        }

        if (position.size > 0 && _sizeDelta > 0) {
            position.averagePrice = (position.positionSize * position.averagePrice + _sizeDelta * price) / (position.positionSize + _sizeDelta);
        }

        // 修改多空头
        int256 prevLongShortTracker = longShortTracker;
        longShortTracker = prevLongShortTracker + (_isLong ? sizeAmount : -sizeAmount);
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker > prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, sizeAmount, 0);
            } else if (longShortTracker > 0) {
                // 多头偏移减少，且未转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, sizeAmount, 0);
            } else {
                // 多头转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, prevLongShortTracker, 0);
                pairVault.increaseReserveAmount(_pairIndex, 0, (sizeAmount - prevLongShortTracker).getAmountByPrice(price));
            }
        } else {
            // 空头偏移增加
            if (longShortTracker < prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, 0, _sizeDelta);
            } else if (longShortTracker > 0) {
                // 空头偏移减少，且未转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, _sizeDelta);
            } else {
                // 空头转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, ((uint256)-prevLongShortTracker).getAmountByPrice(price));
                pairVault.increaseReserveAmount(_pairIndex, 0, (sizeAmount + prevLongShortTracker).getAmountByPrice(price));
            }
        }

        // 修改LP仓位平均价格
        IPairVault.Vault lpVault = pairVault.getVault(_pairIndex);
        if (prevLongShortTracker > 0) {
            if (_isLong) {
                uint256 averagePrice = (lpVault.averagePrice * prevLongShortTracker) / (prevLongShortTracker + _amount);
                pairVault.updateAveragePrice(averagePrice);
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
                uint256 averagePrice = (lpVault.averagePrice * prevLongShortTracker) / (prevLongShortTracker + _amount);
                pairVault.updateAveragePrice(averagePrice);
            }
        }

    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function getPrice(address _token, bool _isLong) public view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
