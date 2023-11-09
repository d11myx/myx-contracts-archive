// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/Pausable.sol";

import "../interfaces/IExecutor.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IIndexPriceFeed.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IExecutionLogic.sol";
import "../libraries/Roleable.sol";
import "../interfaces/ILiquidationLogic.sol";

contract Executor is IExecutor, Roleable, Pausable {
    constructor(IAddressesProvider addressProvider) Roleable(addressProvider) {}

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(msg.sender), "opk");
        _;
    }

    function setPaused() external onlyPoolAdmin {
        _pause();
    }

    function setUnPaused() external onlyPoolAdmin {
        _unpause();
    }

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeIncreaseMarketOrders(
            msg.sender,
            increaseOrders
        );
    }

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeDecreaseMarketOrders(
            msg.sender,
            decreaseOrders
        );
    }

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeIncreaseLimitOrders(
            msg.sender,
            increaseOrders
        );
    }

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeDecreaseLimitOrders(
            msg.sender,
            decreaseOrders
        );
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecution.ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 tier,
        uint256 commissionRatio
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeADLAndDecreaseOrder(
            msg.sender,
            executePositions,
            orderId,
            tradeType,
            tier,
            commissionRatio
        );
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecution.ExecutePosition[] memory executePositions
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        ILiquidationLogic(ADDRESS_PROVIDER.liquidationLogic()).liquidatePositions(
            msg.sender,
            executePositions
        );
    }

    function setPrices(
        address[] memory _tokens,
        uint256[] memory _prices,
        bytes[] memory updateData
    ) external payable {
        require(msg.sender == address(this), "internal");

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).updatePrice(_tokens, _prices);

        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(
            _tokens,
            updateData
        );
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool) {
        return
            IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).needADL(
                pairIndex,
                isLong,
                executionSize,
                executionPrice
            );
    }
}
