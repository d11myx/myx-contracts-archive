// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";

import "./interfaces/ITradingVault.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/access/Handleable.sol";
import "../pair/interfaces/IPairVault.sol";
import "../price/interfaces/IVaultPriceFeed.sol";
import "hardhat/console.sol";

contract TradingVault is ReentrancyGuardUpgradeable, ITradingVault, Handleable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;

    event IncreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        uint256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee
    );

    event DecreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee
    );

    using PrecisionUtils for uint256;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    IVaultPriceFeed public vaultPriceFeed;
    address public tradingFeeReceiver;

    mapping (bytes32 => Position) public positions;

    mapping(address => bool) public override isFrozen;

    mapping(uint256 => int256) public override netExposureAmountChecker;
    mapping(uint256 => int256) public override longShortTracker;

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        IVaultPriceFeed _vaultPriceFeed,
        address _tradingFeeReceiver
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        vaultPriceFeed = _vaultPriceFeed;
        tradingFeeReceiver = _tradingFeeReceiver;
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

    function setTradingFeeReceiver(address _tradingFeeReceiver) external onlyGov {
        tradingFeeReceiver = _tradingFeeReceiver;
    }

    function increasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _collateral,
        uint256 _sizeAmount,
        bool _isLong
    ) external nonReentrant onlyHandler {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.enable, "trade pair not supported");

        uint256 price = _getPrice(pair.indexToken, _isLong);

        // check reserve
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
        uint256 sizeDelta = _sizeAmount.getDeltaByPrice(price);
        require(sizeDelta >= tradingConfig.minOpenAmount && sizeDelta <= tradingConfig.maxOpenAmount, "invalid size");

        // trading fee
        IPairInfo.FeePercentage memory feeP = pairInfo.getFeePercentage(_pairIndex);
        uint256 tradingFee;
        if (netExposureAmountChecker[_pairIndex] >= 0) {
            // 偏向多头
            if (_isLong) {
                // fee
                tradingFee = sizeDelta.mulPercentage(feeP.takerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(feeP.makerFeeP);
            }
        } else {
            // 偏向空头
            if (_isLong) {
                tradingFee = sizeDelta.mulPercentage(feeP.makerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(feeP.takerFeeP);
            }
        }
        uint256 afterFeeCollateral = _collateral - tradingFee;

        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);

        // get position
        bytes32 positionKey = getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];
        position.collateral = position.collateral + _collateral;
        position.positionAmount = position.positionAmount + _sizeAmount;

        // 修改价格
        if (position.positionAmount == 0) {
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = price;
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount * position.averagePrice + sizeDelta) / (position.positionAmount + _sizeAmount);
        }

        // 修改多空头
        netExposureAmountChecker[_pairIndex] = netExposureAmountChecker[_pairIndex] + (_isLong ? int256(_sizeAmount) : -int256(_sizeAmount));

        int256 prevLongShortTracker = longShortTracker[_pairIndex];
        longShortTracker[_pairIndex] = prevLongShortTracker + (_isLong ? int256(_sizeAmount) : -int256(_sizeAmount));
        console.log("increasePosition prevLongShortTracker", prevLongShortTracker > 0 ? uint256(prevLongShortTracker) : uint256(-prevLongShortTracker));
        console.log("increasePosition sizeAmount", _sizeAmount);

        // 修改LP资产冻结
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker[_pairIndex] > prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else if (longShortTracker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                // 多头转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevLongShortTracker), 0);
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else if (prevLongShortTracker < 0) {
            // 空头偏移增加
            if (longShortTracker[_pairIndex] < prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            } else if (longShortTracker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
            } else {
                // 空头转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(-prevLongShortTracker).getAmountByPrice(price));
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount + uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else {
            // 原有偏移为0
            if (longShortTracker[_pairIndex] > 0) {
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
        }

        // 修改LP仓位平均价格
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        if (prevLongShortTracker > 0) {
            if (_isLong) {
                // BTO
                uint256 averagePrice = (lpVault.averagePrice * uint256(prevLongShortTracker) + sizeDelta) / (uint256(prevLongShortTracker) + _sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else {
                // STO
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.getDeltaByPrice(price - lpVault.averagePrice);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.getDeltaByPrice(lpVault.averagePrice - price);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            }
        } else {
            if (_isLong) {
                // BTO
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.getDeltaByPrice(price - lpVault.averagePrice);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.getDeltaByPrice(lpVault.averagePrice - price);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                }
            } else {
                // STO
                uint256 averagePrice = (lpVault.averagePrice * uint256(-prevLongShortTracker) + sizeDelta) / (uint256(-prevLongShortTracker) + _sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            }
        }

        emit IncreasePosition(
            positionKey,
            _account,
            _pairIndex,
            afterFeeCollateral,
            _isLong,
            _sizeAmount,
            price,
            tradingFee
        );
    }

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _sizeAmount,
        bool _isLong
    ) external onlyHandler nonReentrant {
        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = _getPrice(pair.indexToken, _isLong);

        // get position
        bytes32 positionKey = getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];

        _sizeAmount = _sizeAmount.min(position.positionAmount);
        uint256 sizeDelta = _sizeAmount.getDeltaByPrice(price);

        // trading fee
        IPairInfo.FeePercentage memory feeP = pairInfo.getFeePercentage(_pairIndex);
        uint256 tradingFee;
        if (netExposureAmountChecker[_pairIndex] >= 0) {
            // 偏向多头
            if (_isLong) {
                // fee
                tradingFee = sizeDelta.mulPercentage(feeP.takerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(feeP.makerFeeP);
            }
        } else {
            // 偏向空头
            if (_isLong) {
                tradingFee = sizeDelta.mulPercentage(feeP.makerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(feeP.takerFeeP);
            }
        }
        // todo 保证金不足以支付fee
        uint256 afterFeeCollateral = position.collateral - tradingFee;
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);

        // 修改position size
        position.positionAmount = position.positionAmount - _sizeAmount;

        // 修改多空头
        netExposureAmountChecker[_pairIndex] = netExposureAmountChecker[_pairIndex] + (_isLong ? -int256(_sizeAmount) : int256(_sizeAmount));
        int256 prevLongShortTracker = longShortTracker[_pairIndex];
        longShortTracker[_pairIndex] = prevLongShortTracker + (_isLong ? -int256(_sizeAmount) : int256(_sizeAmount));

        // 修改LP资产冻结
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker[_pairIndex] > prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else if (longShortTracker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                // 多头转化为空头
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevLongShortTracker), 0);
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else if (prevLongShortTracker < 0) {
            // 空头偏移增加
            if (longShortTracker[_pairIndex] < prevLongShortTracker) {
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            } else if (longShortTracker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
            } else {
                // 空头转化为多头
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(-prevLongShortTracker).getAmountByPrice(price));
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount + uint256(prevLongShortTracker)).getAmountByPrice(price));
            }
        } else {
            // 原有偏移为0
            if (longShortTracker[_pairIndex] > 0) {
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
        }

        // 修改LP仓位平均价格
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        if (prevLongShortTracker > 0) {
            if (_isLong) {
                // BTC
                uint256 averagePrice = (lpVault.averagePrice * uint256(prevLongShortTracker) + sizeDelta) / (uint256(prevLongShortTracker) + _sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else {
                // STC
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.getDeltaByPrice(price - lpVault.averagePrice);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.getDeltaByPrice(lpVault.averagePrice - price);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            }
        } else {
            if (_isLong) {
                // BTC
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.getDeltaByPrice(price - lpVault.averagePrice);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.getDeltaByPrice(lpVault.averagePrice - price);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                }
            } else {
                // STC
                uint256 averagePrice = (lpVault.averagePrice * uint256(-prevLongShortTracker) + sizeDelta) / (uint256(-prevLongShortTracker) + _sizeAmount);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            }
        }

        // 结算用户Pnl
        uint256 pnl;
        if (_isLong) {
            if (price > position.averagePrice) {
                pnl = _sizeAmount * (price - position.averagePrice);
                IERC20(pair.stableToken).transfer(address(position.account), pnl);
            } else {
                pnl = _sizeAmount * (position.averagePrice - price);
                position.collateral -= pnl;
            }
        } else {
            if (position.averagePrice > price) {
                pnl = _sizeAmount * (position.averagePrice - price);
                IERC20(pair.stableToken).transfer(address(position.account), pnl);
            } else {
                pnl = _sizeAmount * (price - position.averagePrice);
                position.collateral -= pnl;
            }
        }

        if (position.positionAmount == 0) {
            delete positions[positionKey];
        }

        emit DecreasePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            _sizeAmount,
            price,
            tradingFee
        );
    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function getPosition(address _account, uint256 _pairIndex, bool _isLong) public view returns(Position memory) {
        return positions[getPositionKey(_account, _pairIndex, _isLong)];
    }

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
