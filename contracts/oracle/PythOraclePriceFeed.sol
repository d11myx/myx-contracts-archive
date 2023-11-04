// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IRoleManager.sol";

contract PythOraclePriceFeed is IPythOraclePriceFeed {
    IAddressesProvider public immutable ADDRESS_PROVIDER;
    uint256 public immutable PRICE_DECIMALS = 30;
    IPyth public pyth;
    mapping(address => bytes32) public tokenPriceIds;

    constructor(
        IAddressesProvider addressProvider,
        address _pyth,
        address[] memory tokens,
        bytes32[] memory priceIds
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pyth = IPyth(_pyth);
        _setTokenPriceIds(tokens, priceIds);
    }

    modifier onlyTimelock() {
        require(msg.sender == ADDRESS_PROVIDER.timelock(), "only timelock");
        _;
    }
//    modifier onlyKeeper() {
//        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(tx.origin), "opk");
//        _;
//    }

    function updatePythAddress(IPyth _pyth) external override onlyTimelock {
        address oldAddress = address(pyth);
        pyth = _pyth;
        emit PythAddressUpdated(oldAddress, address(pyth));
    }

    function setTokenPriceIds(
        address[] memory tokens,
        bytes32[] memory priceIds
    ) external override onlyTimelock {
        _setTokenPriceIds(tokens, priceIds);
    }

    function updatePrice(
        address[] calldata tokens,
        bytes[] calldata updateData
    ) external payable override {
        uint fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) {
            revert("insufficient fee");
        }
        bytes32[] memory priceIds = new bytes32[](tokens.length);
        uint64[] memory publishTimes = new uint64[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokenPriceIds[tokens[i]] != 0, "unknown price id");
            priceIds[i] = tokenPriceIds[tokens[i]];
            publishTimes[i] = uint64(block.timestamp);
        }
        pyth.updatePriceFeedsIfNecessary{value: fee}(updateData, priceIds, publishTimes);
    }

    function getPrice(address token) external view override returns (uint256) {
        bytes32 priceId = _getPriceId(token);
        PythStructs.Price memory pythPrice = pyth.getPriceUnsafe(priceId);
        return _returnPriceWithDecimals(pythPrice);
    }

    function getPriceSafely(address token) external view override returns (uint256) {
        bytes32 priceId = _getPriceId(token);
        PythStructs.Price memory pythPrice;
        try pyth.getPriceNoOlderThan(priceId, 0) returns (PythStructs.Price memory _pythPrice) {
            pythPrice = _pythPrice;
        } catch {
            revert("get price failed");
        }
//        PythStructs.Price memory pythPrice = pyth.getPrice(priceId);
        return _returnPriceWithDecimals(pythPrice);
    }

    function _getPriceId(address token) internal view returns (bytes32) {
        bytes32 priceId = tokenPriceIds[token];
        if (priceId == 0) {
            revert("price feed not found");
        }
        return priceId;
    }

    function _returnPriceWithDecimals(PythStructs.Price memory pythPrice) internal view returns (uint256) {
        if (pythPrice.price < 0) {
            return 0;
        }
        return uint256(uint64(pythPrice.price)) * (10 ** (PRICE_DECIMALS - 8));
    }

    function _setTokenPriceIds(address[] memory tokens, bytes32[] memory priceIds) internal {
        require(tokens.length == priceIds.length, "inconsistent params length");
        for (uint256 i = 0; i < tokens.length; i++) {
            tokenPriceIds[tokens[i]] = priceIds[i];
            emit TokenPriceIdUpdated(tokens[i], priceIds[i]);
        }
    }

    function decimals() public pure override returns (uint256) {
        return PRICE_DECIMALS;
    }
}
