// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IRouter.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRoleManager.sol";
import "./interfaces/ITradingRouter.sol";
import "hardhat/console.sol";
import "../interfaces/IPositionManager.sol";

contract Router is IRouter, ReentrancyGuardUpgradeable {

    IAddressesProvider public immutable addressProvider;

    ITradingRouter public tradingRouter;
    IPositionManager public positionManager;

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), "onlyPoolAdmin");
        _;
    }

    constructor(IAddressesProvider _addressProvider, ITradingRouter _tradingRouter, IPositionManager _positionManager) {
        addressProvider = _addressProvider;
        tradingRouter = _tradingRouter;
        positionManager = _positionManager;
    }

    function updateTradingRouter(ITradingRouter _tradingRouter) external override onlyPoolAdmin {
        address oldAddress = address(_tradingRouter);
        tradingRouter = _tradingRouter;
        address newAddress = address(tradingRouter);

        emit UpdateTradingRouter(oldAddress, newAddress);
    }

    function increaseMarketOrders(uint256 index) external view override returns(TradingTypes.IncreasePositionOrder memory) {
        return tradingRouter.getIncreaseMarketOrder(index);
    }

    function decreaseMarketOrders(uint256 index) external view override returns(TradingTypes.DecreasePositionOrder memory) {
        return tradingRouter.getDecreaseMarketOrder(index);
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

    function increaseLimitOrders(uint256 index) external view override returns(TradingTypes.IncreasePositionOrder memory) {
        return tradingRouter.getIncreaseLimitOrder(index);
    }

    function decreaseLimitOrders(uint256 index) external view override returns(TradingTypes.DecreasePositionOrder memory) {
        return tradingRouter.getDecreaseLimitOrder(index);
    }

    function increaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.increaseLimitOrdersIndex();
    }

    function decreaseLimitOrdersIndex() external view override returns (uint256) {
        return tradingRouter.decreaseLimitOrdersIndex();
    }

    function positionHasTpSl(bytes32 positionKey, TradingTypes.TradeType tradeType) external view override returns (bool) {
        return tradingRouter.positionHasTpSl(positionKey, tradeType);
    }

    function createIncreaseOrder(TradingTypes.IncreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
//        // check leverage
//        bytes32 key = tradingUtils.getPositionKey(account, _request.pairIndex, _request.isLong);
//        (uint256 afterPosition, ) = tradingUtils.validLeverage(_request.account, _request.pairIndex, _request.isLong, _request.collateral, _request.sizeAmount, true);
//        require(afterPosition > 0, "zero position amount");
//
//        // check tp sl
//        require(_request.tp <= afterPosition && _request.sl <= afterPosition, "tp/sl exceeds max size");
//        require(_request.tp == 0 || !positionHasTpSl[key][TradingTypes.TradeType.TP], "tp already exists");
//        require(_request.sl == 0 || !positionHasTpSl[key][TradingTypes.TradeType.SL], "sl already exists");

        //todo tp sl

        return positionManager.createOrder(TradingTypes.CreateOrderRequest({
            account: _request.account,
            pairIndex: _request.pairIndex,
            tradeType: _request.tradeType,
            collateral: _request.collateral,
            openPrice: _request.openPrice,
            isLong: _request.isLong,
            sizeAmount: int256(_request.sizeAmount)
        }));
    }

    function cancelIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override nonReentrant {
        tradingRouter.cancelIncreaseOrder(_orderId, _tradeType);
    }

    function createDecreaseOrder(TradingTypes.DecreasePositionRequest memory _request) external override nonReentrant returns (uint256) {
        return tradingRouter.createDecreaseOrder(_request);
    }

    function cancelDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override nonReentrant {
        tradingRouter.cancelDecreaseOrder(_orderId, _tradeType);
    }

    function cancelAllPositionOrders(address account, uint256 pairIndex, bool isLong) external override {
        tradingRouter.cancelAllPositionOrders(account, pairIndex, isLong);
    }

    function cancelOrders(address account, uint256 pairIndex, bool isLong, bool isIncrease) external override {
        tradingRouter.cancelOrders(account, pairIndex, isLong, isIncrease);
    }

    function createTpSl(TradingTypes.CreateTpSlRequest memory _request) external override returns (uint256 tpOrderId, uint256 slOrderId) {
        return tradingRouter.createTpSl(_request);
    }

    function getIncreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override view returns (TradingTypes.IncreasePositionOrder memory order) {
        return tradingRouter.getIncreaseOrder(_orderId, _tradeType);
    }

    function getDecreaseOrder(uint256 _orderId, TradingTypes.TradeType _tradeType) external override view returns (TradingTypes.DecreasePositionOrder memory order) {
        return tradingRouter.getDecreaseOrder(_orderId, _tradeType);
    }

    function getPositionOrders(bytes32 key) external override view returns (TradingTypes.PositionOrder[] memory orders) {
        return tradingRouter.getPositionOrders(key);
    }

}
