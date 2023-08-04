// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IExecuteRouter.sol";
import "../interfaces/IExecutor.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IPositionManager.sol";

contract Executor is IExecutor, ReentrancyGuardUpgradeable {

    IAddressesProvider public immutable addressProvider;

    IExecuteRouter public executeRouter;
    IPositionManager public positionManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    modifier onlyPositionKeeper() {
        require(IRoleManager(addressProvider.getRoleManager()).isKeeper(msg.sender), "onlyPositionKeeper");
        _;
    }

    constructor(IAddressesProvider _addressProvider, IExecuteRouter _executeRouter, IPositionManager _positionManager) {
        addressProvider = _addressProvider;
        executeRouter = _executeRouter;
        positionManager = _positionManager;
    }

    function updateExecuteRouter(IExecuteRouter _executeRouter) external override onlyPoolAdmin {
        address oldAddress = address(_executeRouter);
        executeRouter = _executeRouter;
        address newAddress = address(executeRouter);

        emit UpdateExecuteRouter(oldAddress, newAddress);
    }

    function setPricesAndExecuteMarketOrders(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        uint256 _increaseEndIndex,
        uint256 _decreaseEndIndex
    ) external override onlyPositionKeeper {
        executeRouter.setPricesAndExecuteMarketOrders(
            _tokens,
            _prices,
            _timestamp,
            _increaseEndIndex,
            _decreaseEndIndex
        );
    }

    function setPricesAndExecuteLimitOrders(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        uint256[] memory _increaseOrderIds,
        uint256[] memory _decreaseOrderIds
    ) external override onlyPositionKeeper {
        executeRouter.setPricesAndExecuteLimitOrders(
            _tokens,
            _prices,
            _timestamp,
            _increaseOrderIds,
            _decreaseOrderIds
        );
    }

    function executeIncreaseMarketOrders(uint256 _endIndex) external override onlyPositionKeeper {
        executeRouter.executeIncreaseMarketOrders(_endIndex);
    }

    function executeIncreaseLimitOrders(uint256[] memory _orderIds) external override onlyPositionKeeper {
        executeRouter.executeIncreaseLimitOrders(_orderIds);
    }

    function executeIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override nonReentrant onlyPositionKeeper {
        executeRouter.executeIncreaseOrder(_orderId, _tradeType);
    }

    function executeDecreaseMarketOrders(uint256 _endIndex) external override onlyPositionKeeper {
        executeRouter.executeDecreaseMarketOrders(_endIndex);
    }

    function executeDecreaseLimitOrders(uint256[] memory _orderIds) external override onlyPositionKeeper {
        executeRouter.executeDecreaseLimitOrders(_orderIds);
    }


    function executeDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override nonReentrant onlyPositionKeeper {
        executeRouter.executeDecreaseOrder(_orderId, _tradeType);
    }

    function setPricesAndLiquidatePositions(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys
    ) external override onlyPositionKeeper {
        positionManager.setPricesAndLiquidatePositions(
            _tokens,
            _prices,
            _timestamp,
            _positionKeys
        );
    }

    function liquidatePositions(bytes32[] memory _positionKeys) external override nonReentrant onlyPositionKeeper {
        positionManager.liquidatePositions(_positionKeys);
    }

    function setPricesAndExecuteADL(
        address[] memory _tokens,
        uint256[] memory _prices,
        uint256 _timestamp,
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType
    ) external override onlyPositionKeeper {
        executeRouter.setPricesAndExecuteADL(
            _tokens,
            _prices,
            _timestamp,
            _positionKeys,
            _sizeAmounts,
            _orderId,
            _tradeType
        );
    }

    function executeADLAndDecreaseOrder(
        bytes32[] memory _positionKeys,
        uint256[] memory _sizeAmounts,
        uint256 _orderId,
        TradingTypes.TradeType _tradeType
    ) external override nonReentrant onlyPositionKeeper {
        executeRouter.executeADLAndDecreaseOrder(
            _positionKeys,
            _sizeAmounts,
            _orderId,
            _tradeType
        );
    }

}
