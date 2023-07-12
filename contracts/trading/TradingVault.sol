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
        uint256 averagePrice,   // 仓位平均价格
        uint256 tradingFee
    );

    event DecreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 sizeAmount,
        uint256 price,
        uint256 averagePrice,   // 仓位平均价格
        uint256 tradingFee,
        int256 realisedPnl
    );

    event ClosePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong
    );

    using PrecisionUtils for uint256;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    IVaultPriceFeed public vaultPriceFeed;
    address public tradingFeeReceiver;

    mapping(bytes32 => Position) public positions;

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
        console.log("increasePosition start");

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.enable, "trade pair not supported");

        uint256 price = _getPrice(pair.indexToken, _isLong);

        // check reserve
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
        uint256 sizeDelta = _sizeAmount.mulPrice(price);
        require(sizeDelta >= tradingConfig.minOpenAmount && sizeDelta <= tradingConfig.maxOpenAmount, "invalid size");
        console.log("increasePosition sizeAmount", _sizeAmount, "sizeDelta", sizeDelta);

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
        console.log("increasePosition tradingFee", tradingFee);

        // position
        bytes32 positionKey = getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];

        if (position.positionAmount == 0) {
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = price;
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) + sizeDelta).mulDiv(PrecisionUtils.pricePrecision(), (position.positionAmount + _sizeAmount));
        }

        position.collateral = position.collateral + afterFeeCollateral;
        position.positionAmount = position.positionAmount + _sizeAmount;

        // 修改多空头
        netExposureAmountChecker[_pairIndex] = netExposureAmountChecker[_pairIndex] + (_isLong ? int256(_sizeAmount) : - int256(_sizeAmount));

        int256 prevLongShortTracker = longShortTracker[_pairIndex];
        longShortTracker[_pairIndex] = prevLongShortTracker + (_isLong ? int256(_sizeAmount) : - int256(_sizeAmount));
        console.log("increasePosition prevLongShortTracker", prevLongShortTracker > 0 ? uint256(prevLongShortTracker) : uint256(- prevLongShortTracker));
        console.log("increasePosition longShortTracker", longShortTracker[_pairIndex] > 0 ? uint256(longShortTracker[_pairIndex]) : uint256(- longShortTracker[_pairIndex]));
        console.log("decreasePosition prevLongShortTracker bigger than zero", prevLongShortTracker > 0, "longShortTracker bigger than zero", longShortTracker[_pairIndex] > 0);
        console.log("increasePosition sizeAmount", _sizeAmount);

        // 修改LP资产冻结及平均价格
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        console.log("increasePosition lp averagePrice", lpVault.averagePrice, "price", price);
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker[_pairIndex] > prevLongShortTracker) {
                console.log("increasePosition BTO long increase");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 修改lp均价
                uint256 averagePrice = (uint256(prevLongShortTracker).mulPrice(lpVault.averagePrice) + sizeDelta)
                    .calculatePrice(uint256(prevLongShortTracker) + _sizeAmount);
                console.log("increasePosition BTO update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (longShortTracker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                console.log("increasePosition STO long decrease");
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition STO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition STO increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 多头转化为空头
                console.log("increasePosition STO long to short");
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevLongShortTracker), 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition STO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition STO increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
                // 修改lp均价
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevLongShortTracker)).mulPrice(price));
                console.log("increasePosition STO Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else if (prevLongShortTracker < 0) {
            // 空头偏移增加
            if (longShortTracker[_pairIndex] < prevLongShortTracker) {
                console.log("increasePosition STO short increase");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 修改lp均价
                uint256 averagePrice = (uint256(- prevLongShortTracker).mulPrice(lpVault.averagePrice) + sizeDelta)
                    .calculatePrice(uint256(-prevLongShortTracker) + _sizeAmount);
                console.log("increasePosition STO update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (longShortTracker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                console.log("increasePosition BTO short decrease");
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition BTO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition BTO increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 空头转化为多头
                console.log("increasePosition BTO short to long");
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(- prevLongShortTracker).mulPrice(price));
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition BTO increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition BTO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                }
                // 修改lp均价
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(- prevLongShortTracker)).mulPrice(price));
                console.log("increasePosition BTO Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else {
            // 原有偏移为0
            if (longShortTracker[_pairIndex] > 0) {
                console.log("increasePosition BTO zero to long");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log("increasePosition STO zero to short");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, price);
        }

        emit IncreasePosition(
            positionKey,
            _account,
            _pairIndex,
            afterFeeCollateral,
            _isLong,
            _sizeAmount,
            price,
            position.averagePrice,
            tradingFee
        );
        console.log("increase position finish");
    }

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        uint256 _sizeAmount,
        bool _isLong
    ) external onlyHandler nonReentrant returns(int256 pnl) {
        console.log("decreasePosition start");

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = _getPrice(pair.indexToken, _isLong);

        // get position
        bytes32 positionKey = getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];

        _sizeAmount = _sizeAmount.min(position.positionAmount);
        uint256 sizeDelta = _sizeAmount.mulPrice(price);
        console.log("decreasePosition sizeAmount", _sizeAmount, "sizeDelta", sizeDelta);

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
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        console.log("decreasePosition tradingFee", tradingFee);

        // position size
        position.collateral = position.collateral - tradingFee;
        position.positionAmount = position.positionAmount - _sizeAmount;
        console.log("decreasePosition position collateral", position.collateral, "positionAmount", position.positionAmount);

        // 修改多空头
        netExposureAmountChecker[_pairIndex] = netExposureAmountChecker[_pairIndex] + (_isLong ? - int256(_sizeAmount) : int256(_sizeAmount));
        int256 prevLongShortTracker = longShortTracker[_pairIndex];
        longShortTracker[_pairIndex] = prevLongShortTracker + (_isLong ? - int256(_sizeAmount) : int256(_sizeAmount));
        console.log("decreasePosition prevLongShortTracker", prevLongShortTracker > 0 ? uint256(prevLongShortTracker) : uint256(- prevLongShortTracker));
        console.log("decreasePosition longShortTracker", longShortTracker[_pairIndex] > 0 ? uint256(longShortTracker[_pairIndex]) : uint256(- longShortTracker[_pairIndex]));
        console.log("decreasePosition prevLongShortTracker bigger than zero", prevLongShortTracker > 0, "longShortTracker bigger than zero", longShortTracker[_pairIndex] > 0);
        console.log("decreasePosition sizeAmount", _sizeAmount);

        // 修改LP资产冻结
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        if (prevLongShortTracker > 0) {
            // 多头偏移增加
            if (longShortTracker[_pairIndex] > prevLongShortTracker) {
                console.log("decreasePosition STC long increase");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                uint256 averagePrice = (uint256(prevLongShortTracker).mulPrice(lpVault.averagePrice) + sizeDelta)
                    .calculatePrice(uint256(prevLongShortTracker) + _sizeAmount);
                console.log("increasePosition STC update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (longShortTracker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                console.log("decreasePosition BTC long decrease");
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition BTC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition BTC increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 多头转化为空头
                console.log("decreasePosition BTC long to short");
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevLongShortTracker), 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition BTC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition BTC increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevLongShortTracker)).divPrice(price));
                console.log("decreasePosition BTC Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else if (prevLongShortTracker < 0) {
            // 空头偏移增加
            if (longShortTracker[_pairIndex] < prevLongShortTracker) {
                console.log("decreasePosition BTC short increase");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 修改lp均价
                uint256 averagePrice = (uint256(- prevLongShortTracker).mulPrice(lpVault.averagePrice) + sizeDelta)
                    .calculatePrice(uint256(- prevLongShortTracker) + _sizeAmount);
                console.log("decreasePosition BTC update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (longShortTracker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                console.log("decreasePosition STC short decrease");
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition STC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition STC increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 空头转化为多头
                console.log("decreasePosition STC short to long");
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(- prevLongShortTracker).divPrice(price));
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition STC increaseProfit", profit);
                    IERC20(pair.stableToken).transfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition STC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit);
                }
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(- prevLongShortTracker)).divPrice(price));
                console.log("decreasePosition STC Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else {
            // 原有偏移为0
            if (longShortTracker[_pairIndex] > 0) {
                console.log("decreasePosition STC zero to long");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log("decreasePosition BTC zero to short");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, price);
        }

        // 结算用户Pnl
        pnl;
        if (_isLong) {
            if (price > position.averagePrice) {
                pnl = int256(_sizeAmount.mulPrice(price - position.averagePrice));
            } else {
                pnl = -int256(_sizeAmount.mulPrice(position.averagePrice - price));
            }
        } else {
            if (position.averagePrice > price) {
                pnl = int256(_sizeAmount.mulPrice(position.averagePrice - price));
            } else {
                pnl = -int256(_sizeAmount.mulPrice(price - position.averagePrice));
            }
        }

        uint256 decreaseCollateral;
        if (pnl > 0) {
            IERC20(pair.stableToken).transfer(position.account, uint256(pnl));
        } else {
            decreaseCollateral = position.collateral.min(uint256(- pnl));
        }
        position.collateral -= decreaseCollateral;
        position.releasedPnl += pnl;

        // todo 保证金归零

        // 关仓
        if (position.positionAmount == 0) {
            IERC20(pair.stableToken).transfer(position.account, position.collateral);

            console.log("decreasePosition position close");
            delete positions[positionKey];
            emit ClosePosition(
                positionKey,
                _account,
                _pairIndex,
                _isLong
            );
        }

        emit DecreasePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            decreaseCollateral,
            _sizeAmount,
            price,
            position.averagePrice,
            tradingFee,
            pnl
        );
        return pnl;
    }

    function getPositionKey(address _account, uint256 _pairIndex, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _pairIndex, _isLong));
    }

    function getPosition(address _account, uint256 _pairIndex, bool _isLong) public view returns (Position memory) {
        return positions[getPositionKey(_account, _pairIndex, _isLong)];
    }

    function getPositionByKey(bytes32 key) public view returns (Position memory) {
        return positions[key];
    }

    function _getPrice(address _token, bool _isLong) internal view returns (uint256) {
        return vaultPriceFeed.getPrice(_token, _isLong ? true : false, false, false);
    }
}
