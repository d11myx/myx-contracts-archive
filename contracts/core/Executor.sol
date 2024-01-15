// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IExecutor.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IIndexPriceFeed.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IExecutionLogic.sol";
import "../libraries/Roleable.sol";
import "../interfaces/ILiquidationLogic.sol";
import "./Backtracker.sol";
import "../interfaces/IPositionManager.sol";

contract Executor is IExecutor, Roleable, ReentrancyGuard, Pausable {

    IPositionManager public positionManager;

    constructor(
        IAddressesProvider addressProvider
    ) Roleable(addressProvider) {
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

    function updatePositionManager(address _positionManager) external onlyPoolAdmin {
        address oldAddress = address(positionManager);
        positionManager = IPositionManager(_positionManager);
        emit UpdatePositionManager(msg.sender, oldAddress, _positionManager);
    }

    function setPricesAndExecuteIncreaseMarketOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecutionLogic.ExecuteOrder[] memory increaseOrders
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
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
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
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
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
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
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeDecreaseLimitOrders(
            msg.sender,
            decreaseOrders
        );
    }

    function setPricesAndExecuteADLOrders(
        address[] memory tokens,
        uint256[] memory prices,
        bytes[] memory updateData,
        IExecution.ExecutePosition[] memory executePositions,
        IExecutionLogic.ExecuteOrder[] memory executeOrders
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
        require(tokens.length == prices.length && tokens.length >= 0, "ip");

        this.setPrices{value: msg.value}(tokens, prices, updateData);

        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).executeADLAndDecreaseOrders(
            msg.sender,
            executePositions,
            executeOrders
        );
    }

    function setPricesAndLiquidatePositions(
        address[] memory _tokens,
        uint256[] memory _prices,
        LiquidatePosition[] memory liquidatePositions
    ) external payable override whenNotPaused nonReentrant onlyPositionKeeper {
        require(_tokens.length == _prices.length && _tokens.length >= 0, "ip");

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).updatePrice(_tokens, _prices);

        for (uint256 i = 0; i < liquidatePositions.length; i++) {
            LiquidatePosition memory execute = liquidatePositions[i];

            IBacktracker(ADDRESS_PROVIDER.backtracker()).enterBacktracking(execute.backtrackRound);
            _updatePriceAndLiquidatePositions(execute);
            IBacktracker(ADDRESS_PROVIDER.backtracker()).quitBacktracking();
        }
    }

    function _updatePriceAndLiquidatePositions(LiquidatePosition memory execute) public payable {
        require(msg.sender == address(this), "internal");

        address[] memory tokens = new address[](1);
        tokens[0] = execute.token;
        bytes[] memory updatesData = new bytes[](1);
        updatesData[0] = execute.updateData;
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updateHistoricalPrice{value: execute.updateFee}(
            tokens,
            updatesData,
            execute.backtrackRound
        );
        try ILiquidationLogic(ADDRESS_PROVIDER.liquidationLogic()).liquidationPosition(
            msg.sender,
            execute.positionKey,
            execute.tier,
            execute.referralsRatio,
            execute.referralUserRatio,
            execute.referralOwner
        ) {} catch Error(string memory reason) {
            emit ExecutePositionError(execute.positionKey, reason);
        }
        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).removeHistoricalPrice(
            execute.backtrackRound,
            tokens
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

    function setPricesHistorical(
        address[] memory _tokens,
        uint256[] memory _prices,
        bytes[] memory updateData,
        uint64 backtrackRound
    ) external payable {
        require(msg.sender == address(this), "internal");

        IIndexPriceFeed(ADDRESS_PROVIDER.indexPriceOracle()).updatePrice(_tokens, _prices);

        IPythOraclePriceFeed(ADDRESS_PROVIDER.priceOracle()).updateHistoricalPrice{value: msg.value}(
            _tokens,
            updateData,
            backtrackRound
        );
    }

    function needADL(
        uint256 pairIndex,
        bool isLong,
        uint256 executionSize,
        uint256 executionPrice
    ) external view returns (bool need, uint256 needADLAmount) {
        return positionManager.needADL(pairIndex, isLong, executionSize, executionPrice);
    }

    function cleanInvalidPositionOrders(
        bytes32[] calldata positionKeys
    ) external override whenNotPaused nonReentrant onlyPositionKeeper {
        IExecutionLogic(ADDRESS_PROVIDER.executionLogic()).cleanInvalidPositionOrders(positionKeys);
    }
}
