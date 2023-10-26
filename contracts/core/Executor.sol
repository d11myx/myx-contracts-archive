// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../interfaces/IExecutor.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IExecutionLogic.sol";
import "../libraries/Upgradeable.sol";
import "../interfaces/ILiquidationLogic.sol";

contract Executor is IExecutor, Upgradeable, PausableUpgradeable {
    IExecutionLogic public executionLogic;
    ILiquidationLogic public liquidationLogic;

    function initialize(
        IAddressesProvider addressProvider,
        IExecutionLogic _executionLogic,
        ILiquidationLogic _liquidationLogic
    ) public initializer {
        ADDRESS_PROVIDER = addressProvider;
        executionLogic = _executionLogic;
        liquidationLogic = _liquidationLogic;
    }

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
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeIncreaseMarketOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeDecreaseMarketOrders(decreaseOrders);
    }

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeIncreaseLimitOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeDecreaseLimitOrders(decreaseOrders);
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecution.ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeADLAndDecreaseOrder(
            executePositions,
            orderId,
            tradeType,
            level,
            commissionRatio
        );
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecution.ExecutePosition[] memory executePositions
    ) external payable override whenNotPaused onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        _setPrices(tokens, prices, timestamp);

        liquidationLogic.liquidatePositions(executePositions);
    }

    function _setPrices(address[] memory _tokens, uint256[] memory _prices, uint256) internal {
        IPriceOracle(ADDRESS_PROVIDER.indexPriceOracle()).updatePrice(_tokens, _prices);
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool) {
        return executionLogic.needADL(pairIndex, isLong, executionSize, executionPrice);
    }
}
