// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import '../interfaces/IExecutor.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IExecutionLogic.sol";

contract Executor is IExecutor {

    IAddressesProvider public immutable ADDRESS_PROVIDER;

    IExecutionLogic public immutable executionLogic;

    constructor(
        IAddressesProvider addressProvider,
        IExecutionLogic _executionLogic
    ) {
        ADDRESS_PROVIDER = addressProvider;
        executionLogic = _executionLogic;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(msg.sender), 'opk');
        _;
    }

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeIncreaseMarketOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeDecreaseMarketOrders(decreaseOrders);
    }

    function setPricesAndExecuteIncreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeIncreaseLimitOrders(increaseOrders);
    }

    function setPricesAndExecuteDecreaseLimitOrders(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecuteOrder[] memory decreaseOrders
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeDecreaseLimitOrders(decreaseOrders);
    }

    function setPricesAndExecuteADL(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecutePosition[] memory executePositions,
        uint256 orderId,
        TradingTypes.TradeType tradeType,
        uint8 level,
        uint256 commissionRatio
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.executeADLAndDecreaseOrder(executePositions, orderId, tradeType, level, commissionRatio);
    }

    function setPricesAndLiquidatePositions(
        address[] memory tokens,
        uint256[] memory prices,
        uint256 timestamp,
        IExecutionLogic.ExecutePosition[] memory executePositions
    ) external payable override onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, 'ip');

        _setPrices(tokens, prices, timestamp);

        executionLogic.liquidatePositions(executePositions);
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool) {
        return executionLogic.needADL(pairIndex, isLong, executionSize, executionPrice);
    }

    function _setPrices(address[] memory _tokens, uint256[] memory _prices, uint256 _timestamp) internal {
        IPriceOracle(ADDRESS_PROVIDER.priceOracle()).updatePrice{value: msg.value}(_tokens, _prices);
    }
}
