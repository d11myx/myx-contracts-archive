// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IRouter.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "./interfaces/ITradingRouter.sol";
import "hardhat/console.sol";

contract Router is IRouter, ReentrancyGuardUpgradeable {

    IAddressesProvider public immutable addressProvider;

    ITradingRouter public tradingRouter;

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    constructor(IAddressesProvider _addressProvider, ITradingRouter _tradingRouter) {
        addressProvider = _addressProvider;
        tradingRouter = _tradingRouter;
    }

    function updateTradingRouter(ITradingRouter _tradingRouter) external override onlyPoolAdmin {
        address oldAddress = address(_tradingRouter);
        tradingRouter = _tradingRouter;
        address newAddress = address(tradingRouter);

        emit UpdateTradingRouter(oldAddress, newAddress);
    }

    function increaseMarketOrdersIndex() external view override returns (uint256) {
        return tradingRouter.increaseMarketOrdersIndex();
    }

    function decreaseMarketOrdersIndex() external view override returns (uint256) {
        return tradingRouter.decreaseMarketOrdersIndex();
    }

    function increaseMarketOrderStartIndex() external view override returns (uint256) {
        return tradingRouter.increaseMarketOrderStartIndex();
    }

    function decreaseMarketOrderStartIndex() external view override returns (uint256) {
        return tradingRouter.decreaseMarketOrderStartIndex();
    }

    function increaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.increaseLimitOrdersIndex();
    }

    function decreaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.decreaseLimitOrdersIndex();
    }

    function positionHasTpSl(bytes32 positionKey, ITradingRouter.TradeType tradeType) external view override returns (bool) {
        return tradingRouter.positionHasTpSl(positionKey, tradeType);
    }

    function createIncreaseOrder(ITradingRouter.IncreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
        return tradingRouter.createIncreaseOrder(_request);
    }

    function cancelIncreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) external override nonReentrant {
        tradingRouter.cancelIncreaseOrder(_orderId, _tradeType);
    }

    function createDecreaseOrder(ITradingRouter.DecreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
        return tradingRouter.createDecreaseOrder(_request);
    }

    function cancelDecreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) external override nonReentrant {
        tradingRouter.cancelDecreaseOrder(_orderId, _tradeType);
    }

    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external override {
        tradingRouter.cancelAllPositionOrders(account, pairIndex, isLong);
    }

    function cancelOrders(address account, uint256 pairIndex, bool isLong, bool isIncrease) external override {
        tradingRouter.cancelOrders(account, pairIndex, isLong, isIncrease);
    }

    function createTpSl(ITradingRouter.CreateTpSlRequest memory _request) external override returns (uint256 tpOrderId, uint256 slOrderId) {
        return tradingRouter.createTpSl(_request);
    }

    function getIncreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) external override view returns (ITradingRouter.IncreasePositionOrder memory order) {
        return tradingRouter.getIncreaseOrder(_orderId, _tradeType);
    }

    function getDecreaseOrder(uint256 _orderId, ITradingRouter.TradeType _tradeType) external override view returns (ITradingRouter.DecreasePositionOrder memory order) {
        return tradingRouter.getDecreaseOrder(_orderId, _tradeType);
    }

    function getPositionOrders(bytes32 key) external override view returns (ITradingRouter.PositionOrder[] memory orders) {
        return tradingRouter.getPositionOrders(key);
    }

}
