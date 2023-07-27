// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "../openzeeplin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../openzeeplin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../openzeeplin/contracts/utils/math/Math.sol";

import "./interfaces/ITradingVault.sol";
import "../libraries/PrecisionUtils.sol";
import "../libraries/Int256Utils.sol";
import "../libraries/access/Handleable.sol";
import "../pair/interfaces/IPairInfo.sol";
import "../pair/interfaces/IPairVault.sol";
import "hardhat/console.sol";
import "./interfaces/ITradingUtils.sol";

contract TradingVault is ReentrancyGuardUpgradeable, ITradingVault, Handleable {
    using SafeERC20 for IERC20;
    using PrecisionUtils for uint256;
    using Math for uint256;
    using Int256Utils for int256;

    event IncreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        int256 collateral,
        bool isLong,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee,
        uint256 transferOut
    );

    event DecreasePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        int256 collateral,
        uint256 sizeAmount,
        uint256 price,
        uint256 tradingFee,
        int256 fundingFee,
        int256 realisedPnl,
        uint256 transferOut
    );

    // 更新后仓位信息
    event UpdatePosition(
        bytes32 positionKey,
        address account,
        uint256 pairIndex,
        bool isLong,
        uint256 collateral,
        uint256 positionAmount,
        uint256 averagePrice,
        int256 entryFundingRate,
        uint256 entryFundingTime,
        int256 realisedPnl,
        uint256 price
    );

    event ClosePosition(bytes32 positionKey, address account, uint256 pairIndex, bool isLong);

    event UpdateFundingRate(uint256 pairIndex, int256 fundingRate, uint256 lastFundingTime);

    using PrecisionUtils for uint256;

    IPairInfo public pairInfo;
    IPairVault public pairVault;
    ITradingUtils public tradingUtils;
    address public tradingFeeReceiver;

    mapping(bytes32 => Position) public positions;

    mapping(address => bool) public override isFrozen;

    mapping(uint256 => int256) public override netExposureAmountChecker;
    mapping(uint256 => uint256) public override longTracker;
    mapping(uint256 => uint256) public override shortTracker;

    // cumulativeFundingRates tracks the funding rates based on utilization
    mapping(uint256 => int256) public cumulativeFundingRates;
    mapping(uint256 => int256) public lastFundingRates;
    // lastFundingTimes tracks the last time funding was updated for a token
    mapping(uint256 => uint256) public lastFundingTimes;

    uint256 constant public fundingInterval = 8 hours;

    function initialize(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingUtils _tradingUtils,
        address _tradingFeeReceiver
    ) external initializer {
        __ReentrancyGuard_init();
        __Handleable_init();
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingUtils = _tradingUtils;
        tradingFeeReceiver = _tradingFeeReceiver;
    }

    function setContract(
        IPairInfo _pairInfo,
        IPairVault _pairVault,
        ITradingUtils _tradingUtils
    ) external onlyGov {
        pairInfo = _pairInfo;
        pairVault = _pairVault;
        tradingUtils = _tradingUtils;
    }

    function setTradingFeeReceiver(address _tradingFeeReceiver) external onlyGov {
        tradingFeeReceiver = _tradingFeeReceiver;
    }

    function increasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong
    ) external nonReentrant onlyHandler returns (uint256 tradingFee, int256 fundingFee) {

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        require(pair.enable, "trade pair not supported");

        uint256 price = tradingUtils.getPrice(_pairIndex, _isLong);

        // get position
        bytes32 positionKey = tradingUtils.getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];
        position.key = positionKey;

        uint256 sizeDelta = _sizeAmount.mulPrice(price);
        console.log("increasePosition sizeAmount", _sizeAmount, "sizeDelta", sizeDelta);

        // 修改仓位
        if (position.positionAmount == 0) {
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
            position.averagePrice = price;
        }

        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) + sizeDelta).mulDiv(PrecisionUtils.pricePrecision(), (position.positionAmount + _sizeAmount));
        }

        position.collateral = (int256(position.collateral) + _collateral).abs();
        position.positionAmount = position.positionAmount + _sizeAmount;

        uint256 transferOut = _collateral > 0 ? 0 : _collateral.abs();

        // funding fee
        updateCumulativeFundingRate(_pairIndex);
        fundingFee = getFundingFee(true, _account, _pairIndex, _isLong, _sizeAmount);
        console.log("increasePosition lastFundingTimes", lastFundingTimes[_pairIndex]);
        console.log("increasePosition cumulativeFundingRates", cumulativeFundingRates[_pairIndex].toString());
        console.log("increasePosition fundingFee", fundingFee.toString());

        if (fundingFee >= 0) {
            uint256 absFundingFee = uint256(fundingFee);
            if (_isLong) {
                require(position.collateral >= absFundingFee, "collateral not enough for funding fee");
                position.collateral -= absFundingFee;
                console.log("increasePosition long pay funding fee");
            } else {
                transferOut += absFundingFee;  // todo distribute
                console.log("increasePosition long take funding fee");
            }
        } else {
            uint256 absFundingFee = uint256(- fundingFee);
            if (!_isLong) {
                require(position.collateral >= absFundingFee, "collateral not enough for funding fee");
                position.collateral = position.collateral - absFundingFee;
                console.log("increasePosition short pay funding fee");
            } else {
                transferOut += absFundingFee;  // todo distribute
                console.log("increasePosition short take funding fee");
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = getTradingFee(_pairIndex, _isLong, _sizeAmount);
        require(position.collateral + transferOut >= tradingFee, "collateral not enough for trading fee");

        if (transferOut >= tradingFee) {
            // 提取数量足够支付trading fee
            transferOut -= tradingFee;
        } else {
            // 不够支付trading fee，从剩余保证金扣除
            transferOut == 0;
            position.collateral -= tradingFee - transferOut;
        }
        // todo distribute
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        console.log("increasePosition tradingFee", tradingFee);

        // 修改多空头
        int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
        netExposureAmountChecker[_pairIndex] = prevNetExposureAmountChecker + (_isLong ? int256(_sizeAmount) : - int256(_sizeAmount));
        if (_isLong) {
            longTracker[_pairIndex] += _sizeAmount;
        } else {
            shortTracker[_pairIndex] += _sizeAmount;
        }

        console.log("increasePosition prevNetExposureAmountChecker", prevNetExposureAmountChecker.toString());
        console.log("increasePosition netExposureAmountChecker", netExposureAmountChecker[_pairIndex].toString());
        console.log("increasePosition longTracker", longTracker[_pairIndex], "shortTracker", shortTracker[_pairIndex]);

        // 修改LP资产冻结及平均价格
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        console.log("increasePosition lp averagePrice", lpVault.averagePrice, "price", price);
        if (prevNetExposureAmountChecker > 0) {
            // 多头偏移增加
            if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                console.log("increasePosition BTO long increase");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 修改lp均价
                uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) + sizeDelta)
                .calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);
                console.log("increasePosition BTO update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                console.log("increasePosition STO long decrease");
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition STO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition STO increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 多头转化为空头
                console.log("increasePosition STO long to short");
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevNetExposureAmountChecker), 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition STO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition STO increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
                // 修改lp均价
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevNetExposureAmountChecker)).mulPrice(price));
                console.log("increasePosition STO Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else if (prevNetExposureAmountChecker < 0) {
            // 空头偏移增加
            if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                console.log("increasePosition STO short increase");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 修改lp均价
                uint256 averagePrice = (uint256(- prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) + sizeDelta)
                .calculatePrice(uint256(- prevNetExposureAmountChecker) + _sizeAmount);
                console.log("increasePosition STO update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                console.log("increasePosition BTO short decrease");
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition BTO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition BTO increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 空头转化为多头
                console.log("increasePosition BTO short to long");
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(- prevNetExposureAmountChecker).mulPrice(price));
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("increasePosition BTO increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("increasePosition BTO decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                }
                // 修改lp均价
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(- prevNetExposureAmountChecker)).mulPrice(price));
                console.log("increasePosition BTO Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else {
            // 原有偏移为0
            if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log("increasePosition BTO zero to long");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log("increasePosition STO zero to short");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, price);
        }

        if (transferOut > 0) {
            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }

        emit IncreasePosition(
            positionKey,
            _account,
            _pairIndex,
            _collateral,
            _isLong,
            _sizeAmount,
            price,
            tradingFee,
            fundingFee,
            transferOut
        );

        emit UpdatePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            position.collateral,
            position.positionAmount,
            position.averagePrice,
            position.entryFundingRate,
            position.entryFundingTime,
            position.realisedPnl,
            price
        );

        console.log("increase position finish");
    }

    function decreasePosition(
        address _account,
        uint256 _pairIndex,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _isLong
    ) external onlyHandler nonReentrant returns (uint256 tradingFee, int256 fundingFee, int256 pnl) {

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        uint256 price = tradingUtils.getPrice(_pairIndex, _isLong);

        // check trading amount
        IPairInfo.TradingConfig memory tradingConfig = pairInfo.getTradingConfig(_pairIndex);
        require(_sizeAmount >= tradingConfig.minTradeAmount && _sizeAmount <= tradingConfig.maxTradeAmount, "invalid size");

        // get position
        bytes32 positionKey = tradingUtils.getPositionKey(_account, _pairIndex, _isLong);
        Position storage position = positions[positionKey];
        require(position.account != address(0), "position already closed");

        uint256 sizeDelta = _sizeAmount.mulPrice(price);
        console.log("decreasePosition sizeAmount", _sizeAmount, "sizeDelta", sizeDelta);

        // 修改仓位
        if (position.positionAmount > 0 && sizeDelta > 0) {
            position.averagePrice = (position.positionAmount.mulPrice(position.averagePrice) + sizeDelta).mulDiv(PrecisionUtils.pricePrecision(), (position.positionAmount + _sizeAmount));
        }

        position.collateral = (int256(position.collateral) + _collateral).abs();
        position.positionAmount -= _sizeAmount;
        console.log("decreasePosition position collateral", position.collateral, "positionAmount", position.positionAmount);

        uint256 transferOut = _collateral > 0 ? 0 : _collateral.abs();

        // funding fee
        updateCumulativeFundingRate(_pairIndex);
        fundingFee = getFundingFee(false, _account, _pairIndex, _isLong, _sizeAmount);
        console.log("decreasePosition lastFundingTimes", lastFundingTimes[_pairIndex]);
        console.log("decreasePosition cumulativeFundingRates", cumulativeFundingRates[_pairIndex].toString());
        console.log("decreasePosition fundingFee", fundingFee.toString());

        if (fundingFee >= 0) {
            uint256 absFundingFee = uint256(fundingFee);
            if (_isLong) {
                require(position.collateral >= absFundingFee, "collateral not enough for funding fee");
                position.collateral -= absFundingFee;
                console.log("decreasePosition long pay funding fee");
            } else {
                transferOut += absFundingFee;  // todo distribute
                console.log("decreasePosition long take funding fee");
            }
        } else {
            uint256 absFundingFee = uint256(- fundingFee);
            if (!_isLong) {
                require(position.collateral >= absFundingFee, "collateral not enough for funding fee");
                position.collateral = position.collateral - absFundingFee;
                console.log("decreasePosition short pay funding fee");
            } else {
                transferOut += absFundingFee;  // todo distribute
                console.log("decreasePosition short take funding fee");
            }
        }

        position.entryFundingRate = cumulativeFundingRates[_pairIndex];
        position.entryFundingTime = lastFundingTimes[_pairIndex];

        // trading fee
        tradingFee = getTradingFee(_pairIndex, _isLong, _sizeAmount);
        require(position.collateral + transferOut >= tradingFee, "collateral not enough for trading fee");

        if (transferOut >= tradingFee) {
            // 提取数量足够支付trading fee
            transferOut -= tradingFee;
        } else {
            // 不够支付trading fee，从剩余保证金扣除
            transferOut == 0;
            position.collateral -= tradingFee - transferOut;
        }
        // todo fee distribute
        IERC20(pair.stableToken).safeTransfer(tradingFeeReceiver, tradingFee);
        console.log("decreasePosition tradingFee", tradingFee);

        // 修改多空头
        int256 prevNetExposureAmountChecker = netExposureAmountChecker[_pairIndex];
        netExposureAmountChecker[_pairIndex] = prevNetExposureAmountChecker + (_isLong ? - int256(_sizeAmount) : int256(_sizeAmount));
        if (_isLong) {
            longTracker[_pairIndex] -= _sizeAmount;
        } else {
            shortTracker[_pairIndex] -= _sizeAmount;
        }

        console.log("decreasePosition prevNetExposureAmountChecker", prevNetExposureAmountChecker.toString());
        console.log("decreasePosition netExposureAmountChecker", netExposureAmountChecker[_pairIndex].toString());
        console.log("decreasePosition longTracker", longTracker[_pairIndex], "shortTracker", shortTracker[_pairIndex]);

        // 修改LP资产冻结
        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        if (prevNetExposureAmountChecker > 0) {
            // 多头偏移增加
            if (netExposureAmountChecker[_pairIndex] > prevNetExposureAmountChecker) {
                console.log("decreasePosition STC long increase");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
                uint256 averagePrice = (uint256(prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) + sizeDelta)
                .calculatePrice(uint256(prevNetExposureAmountChecker) + _sizeAmount);
                console.log("decreasePosition STC update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] > 0) {
                // 多头偏移减少，且未转化为空头
                console.log("decreasePosition BTC long decrease");
                pairVault.decreaseReserveAmount(_pairIndex, _sizeAmount, 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition BTC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition BTC increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 多头转化为空头
                console.log("decreasePosition BTC long to short");
                pairVault.decreaseReserveAmount(_pairIndex, uint256(prevNetExposureAmountChecker), 0);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition BTC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition BTC increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(prevNetExposureAmountChecker)).divPrice(price));
                console.log("decreasePosition BTC Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else if (prevNetExposureAmountChecker < 0) {
            // 空头偏移增加
            if (netExposureAmountChecker[_pairIndex] < prevNetExposureAmountChecker) {
                console.log("decreasePosition BTC short increase");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 修改lp均价
                uint256 averagePrice = (uint256(- prevNetExposureAmountChecker).mulPrice(lpVault.averagePrice) + sizeDelta)
                .calculatePrice(uint256(- prevNetExposureAmountChecker) + _sizeAmount);
                console.log("decreasePosition BTC update averagePrice", averagePrice);
                pairVault.updateAveragePrice(_pairIndex, averagePrice);
            } else if (netExposureAmountChecker[_pairIndex] < 0) {
                // 空头偏移减少，且未转化为多头
                console.log("decreasePosition STC short decrease");
                pairVault.decreaseReserveAmount(_pairIndex, 0, sizeDelta);
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition STC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition STC increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                }
            } else {
                // 空头转化为多头
                console.log("decreasePosition STC short to long");
                pairVault.decreaseReserveAmount(_pairIndex, 0, uint256(- prevNetExposureAmountChecker).divPrice(price));
                // 结算pnl
                if (price > lpVault.averagePrice) {
                    uint256 profit = _sizeAmount.mulPrice(price - lpVault.averagePrice);
                    console.log("decreasePosition STC increaseProfit", profit);
                    IERC20(pair.stableToken).safeTransfer(address(pairVault), profit);
                    pairVault.increaseProfit(_pairIndex, profit);
                } else {
                    uint256 profit = _sizeAmount.mulPrice(lpVault.averagePrice - price);
                    console.log("decreasePosition STC decreaseProfit", profit);
                    pairVault.decreaseProfit(_pairIndex, profit, price);
                }
                pairVault.increaseReserveAmount(_pairIndex, 0, (_sizeAmount - uint256(- prevNetExposureAmountChecker)).divPrice(price));
                console.log("decreasePosition STC Long to Short update averagePrice", price);
                pairVault.updateAveragePrice(_pairIndex, price);
            }
        } else {
            // 原有偏移为0
            if (netExposureAmountChecker[_pairIndex] > 0) {
                console.log("decreasePosition STC zero to long");
                pairVault.increaseReserveAmount(_pairIndex, _sizeAmount, 0);
            } else {
                console.log("decreasePosition BTC zero to short");
                pairVault.increaseReserveAmount(_pairIndex, 0, sizeDelta);
            }
            pairVault.updateAveragePrice(_pairIndex, price);
        }

        // 结算用户Pnl
        pnl = tradingUtils.getUnrealizedPnl(position.account, position.pairIndex, position.isLong, _sizeAmount);
        console.log("decreasePosition pnl", pnl.toString());

        if (pnl > 0) {
            transferOut += pnl.abs();
        } else {
            position.collateral -= position.collateral.min(uint256(- pnl));
        }
        position.realisedPnl += pnl;

        console.log("decreasePosition collateral", position.collateral);

        if (transferOut > 0) {
            IERC20(pair.stableToken).safeTransfer(_account, transferOut);
        }

        // 关仓
        if (position.positionAmount == 0) {

            if (position.collateral > 0) {
                IERC20(pair.stableToken).safeTransfer(position.account, position.collateral);
            }

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
            _collateral,
            _sizeAmount,
            price,
            tradingFee,
            fundingFee,
            pnl,
            transferOut
        );

        emit UpdatePosition(
            positionKey,
            _account,
            _pairIndex,
            _isLong,
            position.collateral,
            position.positionAmount,
            position.averagePrice,
            position.entryFundingRate,
            position.entryFundingTime,
            position.realisedPnl,
            price
        );
    }

    function updateCumulativeFundingRate(uint256 _pairIndex) public {
        if (lastFundingTimes[_pairIndex] == 0) {
            lastFundingTimes[_pairIndex] = block.timestamp / fundingInterval * fundingInterval;
            return;
        }

        if (block.timestamp - lastFundingTimes[_pairIndex] < fundingInterval) {
            console.log("updateCumulativeFundingRate no need update");
            return;
        }

        uint256 intervals = (block.timestamp - lastFundingTimes[_pairIndex]) / fundingInterval;
        int256 nextFundingRate = getCurrentFundingRate(_pairIndex);

        lastFundingRates[_pairIndex] = nextFundingRate;
        cumulativeFundingRates[_pairIndex] = cumulativeFundingRates[_pairIndex] + nextFundingRate * int256(intervals);
        lastFundingTimes[_pairIndex] = block.timestamp / fundingInterval * fundingInterval;

        emit UpdateFundingRate(_pairIndex, cumulativeFundingRates[_pairIndex], lastFundingTimes[_pairIndex]);
    }

    function buyIndexToken(uint256 _pairIndex, uint256 _amount) public onlyHandler {
        uint256 price = tradingUtils.getPrice(_pairIndex, true);
        uint256 stableAmount = _amount.mulPrice(price);

        IPairInfo.Pair memory pair = pairInfo.getPair(_pairIndex);
        IERC20(pair.stableToken).safeTransferFrom(msg.sender, address(this), stableAmount);
        IERC20(pair.indexToken).safeTransfer(msg.sender, _amount);
    }

    function getTradingFee(uint256 _pairIndex, bool _isLong, uint256 _sizeAmount) public override view returns (uint256 tradingFee) {
        uint256 price = tradingUtils.getPrice(_pairIndex, _isLong);
        uint256 sizeDelta = _sizeAmount.mulPrice(price);

        IPairInfo.TradingFeeConfig memory tradingFeeConfig = pairInfo.getTradingFeeConfig(_pairIndex);
        if (netExposureAmountChecker[_pairIndex] >= 0) {
            // 偏向多头
            if (_isLong) {
                // fee
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP);
            }
        } else {
            // 偏向空头
            if (_isLong) {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.makerFeeP);
            } else {
                tradingFee = sizeDelta.mulPercentage(tradingFeeConfig.takerFeeP);
            }
        }
        return tradingFee;
    }

    function getFundingFee(
        bool _increase,
        address _account,
        uint256 _pairIndex,
        bool _isLong,
        uint256 _sizeAmount
    ) public override view returns (int256) {
        Position memory position = getPosition(_account, _pairIndex, _isLong);

        uint256 interval = block.timestamp - position.entryFundingTime;
        if (interval < fundingInterval) {
            if (!_increase) {
                int256 fundingRate = lastFundingRates[_pairIndex] * int256(interval) / int256(fundingInterval);
                return int256(_sizeAmount) * fundingRate / int256(PrecisionUtils.fundingRatePrecision());
            }
        }

        int256 fundingRate = cumulativeFundingRates[_pairIndex] - position.entryFundingRate;
        return int256(position.positionAmount) * fundingRate / int256(PrecisionUtils.fundingRatePrecision());
    }

    function getCurrentFundingRate(uint256 _pairIndex) public override view returns (int256) {
        IPairInfo.FundingFeeConfig memory fundingFeeConfig = pairInfo.getFundingFeeConfig(_pairIndex);

        uint256 absNetExposure = netExposureAmountChecker[_pairIndex] >= 0 ? uint256(netExposureAmountChecker[_pairIndex]) : uint256(- netExposureAmountChecker[_pairIndex]);
        uint256 w = fundingFeeConfig.fundingWeightFactor;
        uint256 q = longTracker[_pairIndex] + shortTracker[_pairIndex];
        uint256 k = fundingFeeConfig.liquidityPremiumFactor;

        IPairVault.Vault memory lpVault = pairVault.getVault(_pairIndex);
        uint256 price = tradingUtils.getPrice(_pairIndex, true);
        uint256 l = (lpVault.indexTotalAmount - lpVault.indexReservedAmount).mulPrice(price) + (lpVault.stableTotalAmount - lpVault.stableReservedAmount);

        uint256 fundingRate = w * absNetExposure * PrecisionUtils.fundingRatePrecision() / (k * q)
            + (PrecisionUtils.fundingRatePrecision() - w) * absNetExposure / (k * l);

        fundingRate = fundingRate >= fundingFeeConfig.interest ?
        (fundingRate - fundingFeeConfig.interest).min(fundingFeeConfig.minFundingRate).max(fundingFeeConfig.maxFundingRate) :
        (fundingFeeConfig.interest - fundingRate).min(fundingFeeConfig.minFundingRate).max(fundingFeeConfig.maxFundingRate);
        console.log("getCurrentFundingRate fundingRate", fundingRate);

        return netExposureAmountChecker[_pairIndex] >= 0 ? int256(fundingRate) : - int256(fundingRate);
    }

    function getPosition(address _account, uint256 _pairIndex, bool _isLong) public view returns (Position memory) {
        Position memory position = positions[tradingUtils.getPositionKey(_account, _pairIndex, _isLong)];
        if (position.account == address(0)) {
            position.key = tradingUtils.getPositionKey(_account, _pairIndex, _isLong);
            position.account = _account;
            position.pairIndex = _pairIndex;
            position.isLong = _isLong;
        }
        return position;
    }

    function getPositionByKey(bytes32 key) public view returns (Position memory) {
        Position memory position = positions[key];
        if (position.account == address(0)) {
            position.key = key;
        }
        return position;
    }
}
