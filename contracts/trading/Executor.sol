// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IExecutor.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IOrderManager.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/IIndexPriceFeed.sol";
import "hardhat/console.sol";

contract Executor is IExecutor, ReentrancyGuardUpgradeable {

    uint256 public increaseMarketOrderStartIndex;
    uint256 public decreaseMarketOrderStartIndex;

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IOrderManager public orderManager;
    IPositionManager public positionManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.getRoleManager()).isKeeper(msg.sender), "onlyPositionKeeper");
        _;
    }

    constructor(IAddressesProvider addressProvider, IOrderManager _orderManager, IPositionManager _positionManager) {
        ADDRESS_PROVIDER = addressProvider;
        orderManager = _orderManager;
        positionManager = _positionManager;
    }

    function setPricesAndExecuteMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256 increaseEndIndex,
        uint256 decreaseEndIndex
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "invalid params");

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseMarketOrders(increaseEndIndex);
        this.executeDecreaseMarketOrders(decreaseEndIndex);
    }

    function setPricesAndExecuteLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        uint256[] memory increaseOrderIds,
        uint256[] memory decreaseOrderIds
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "invalid params");

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        this.executeIncreaseLimitOrders(increaseOrderIds);
        this.executeDecreaseLimitOrders(decreaseOrderIds);
    }

    function executeIncreaseMarketOrders(uint256 endIndex) external onlyPositionKeeper {
        console.log("executeIncreaseMarketOrders endIndex", endIndex, "timestamp", block.timestamp);
        uint256 index = increaseMarketOrderStartIndex;
        uint256 length = orderManager.increaseMarketOrdersIndex();

        if (index >= length) {
            return;
        }
        if (endIndex > length) {
            endIndex = length;
        }

        while (index < endIndex) {
            try positionManager.executeIncreaseOrder(index, TradingTypes.TradeType.MARKET) {
                console.log();
            } catch Error(string memory reason) {
                console.log("executeIncreaseMarketOrder error ", reason);
                orderManager.cancelOrder(index, TradingTypes.TradeType.MARKET, true);
            }
            increaseMarketOrderStartIndex++;
        }
    }

    function executeIncreaseLimitOrders(uint256[] memory orderIds) external onlyPositionKeeper {
        console.log("executeIncreaseLimitOrders timestamp", block.timestamp);

        for (uint256 i = 0; i < orderIds.length; i++) {
            try positionManager.executeIncreaseOrder(orderIds[i], TradingTypes.TradeType.LIMIT) {
                console.log();
            } catch Error(string memory reason) {
                console.log("executeIncreaseLimitOrders error ", reason);
            }
        }
    }

    function executeIncreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external nonReentrant onlyPositionKeeper {
        positionManager.executeIncreaseOrder(orderId, tradeType);
    }

    function executeDecreaseMarketOrders(uint256 endIndex) external onlyPositionKeeper {
        console.log("executeDecreaseMarketOrders endIndex", endIndex, "timestamp", block.timestamp);
        uint256 index = decreaseMarketOrderStartIndex;
        uint256 length = orderManager.decreaseMarketOrdersIndex();
        if (index >= length) {
            return;
        }
        if (endIndex > length) {
            endIndex = length;
        }

        while (index < endIndex) {
            try positionManager.executeDecreaseOrder(index, TradingTypes.TradeType.MARKET) {
                console.log("executeDecreaseMarketOrders success index", index, "endIndex", endIndex);
            } catch Error(string memory reason) {
                console.log("executeDecreaseMarketOrders error ", reason);
                orderManager.cancelOrder(index, TradingTypes.TradeType.MARKET, false);
            }
            decreaseMarketOrderStartIndex++;
        }
    }

    function executeDecreaseLimitOrders(uint256[] memory orderIds) external onlyPositionKeeper {
        console.log("executeDecreaseLimitOrders timestamp", block.timestamp);

        for (uint256 i = 0; i < orderIds.length; i++) {
            try positionManager.executeDecreaseOrder(orderIds[i], TradingTypes.TradeType.LIMIT) {
                console.log("executeDecreaseLimitOrders success index", orderIds[i]);
            } catch Error(string memory reason) {
                console.log("executeDecreaseLimitOrders error ", reason);
            }
        }
    }

    function executeDecreaseOrder(uint256 orderId, TradingTypes.TradeType tradeType) external nonReentrant onlyPositionKeeper {
        positionManager.executeDecreaseOrder(orderId, tradeType);
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys
    ) external nonReentrant onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "invalid params");

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        positionManager.liquidatePositions(positionKeys);
    }

    function liquidatePositions(bytes32[] memory positionKeys) external nonReentrant onlyPositionKeeper {
        positionManager.liquidatePositions(positionKeys);
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        bytes32[] memory positionKeys,
        uint256[] memory sizeAmounts,
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "invalid params");

        IIndexPriceFeed(ADDRESS_PROVIDER.getIndexPriceOracle()).setPrices(tokens, prices, timestamp);

        positionManager.executeADLAndDecreaseOrder(positionKeys, sizeAmounts, orderId, tradeType);
    }

    function executeADLAndDecreaseOrder(
        bytes32[] memory positionKeys,
        uint256[] memory sizeAmounts,
        uint256 orderId,
        TradingTypes.TradeType tradeType
    ) external nonReentrant onlyPositionKeeper {
        positionManager.executeADLAndDecreaseOrder(
            positionKeys,
            sizeAmounts,
            orderId,
            tradeType
        );
    }

}
