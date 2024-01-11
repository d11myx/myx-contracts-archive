// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IRoleManager.sol";
import "../interfaces/IPythOracle.sol";

contract PythOraclePriceFeed is IPythOraclePriceFeed {
    IAddressesProvider public immutable ADDRESS_PROVIDER;
    uint256 public immutable PRICE_DECIMALS = 30;

    uint256 public priceAge;

    IPythOracle public pyth;
    mapping(address => bytes32) public tokenPriceIds;

    constructor(
        IAddressesProvider addressProvider,
        address _pyth,
        address[] memory tokens,
        bytes32[] memory priceIds
    ) {
        priceAge = 10;
        ADDRESS_PROVIDER = addressProvider;
        pyth = IPythOracle(_pyth);
        _setTokenPriceIds(tokens, priceIds);
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isPoolAdmin(msg.sender), "opa");
        _;
    }

    function updatePriceAge(uint256 age) external onlyPoolAdmin {
        uint256 oldAge = priceAge;
        priceAge = age;
        emit PriceAgeUpdated(oldAge, priceAge);
    }

    function updatePythAddress(IPythOracle _pyth) external onlyPoolAdmin {
        address oldAddress = address(pyth);
        pyth = _pyth;
        emit PythAddressUpdated(oldAddress, address(pyth));
    }

    function setTokenPriceIds(
        address[] memory tokens,
        bytes32[] memory priceIds
    ) external onlyPoolAdmin {
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
            require(tokens[i] != address(0), "zero token address");
            require(tokenPriceIds[tokens[i]] != 0, "unknown price id");

            if (pyth.latestPriceInfoPublishTime(tokenPriceIds[tokens[i]]) >= uint64(block.timestamp)) {
                emit UnneededPricePublishWarn();
            }
            priceIds[i] = tokenPriceIds[tokens[i]];
            publishTimes[i] = uint64(block.timestamp);
        }

        if (priceIds.length > 0) {
            try pyth.updatePriceFeedsIfNecessary{value: fee}(updateData, priceIds, publishTimes) {
            } catch Error(string memory reason) {
                emit UpdatePriceFeedsIfNecessaryError(reason);
//                revert("update price failed");
            }
        }
    }

    function getPythPriceUnsafe(address token) external view returns (PythStructs.Price memory) {
        bytes32 priceId = _getPriceId(token);
        return pyth.getPriceUnsafe(priceId);
    }

    function getPythPriceNoOlderThan(address token, uint256 _priceAge) external view returns (PythStructs.Price memory) {
        bytes32 priceId = _getPriceId(token);
        return pyth.getPriceNoOlderThan(priceId, _priceAge);
    }

    function getPythPrice(address token) external view returns (PythStructs.Price memory) {
        bytes32 priceId = _getPriceId(token);
        return pyth.getPrice(priceId);
    }

    function getPrice(address token) external view override returns (uint256) {
        bytes32 priceId = _getPriceId(token);
        PythStructs.Price memory pythPrice = pyth.getPriceUnsafe(priceId);
        return _returnPriceWithDecimals(pythPrice);
    }

    function getPriceSafely(address token) external view override returns (uint256) {
        bytes32 priceId = _getPriceId(token);
        PythStructs.Price memory pythPrice;
        try pyth.getPriceNoOlderThan(priceId, priceAge) returns (PythStructs.Price memory _pythPrice) {
            pythPrice = _pythPrice;
        } catch {
            revert("get price failed");
        }
        return _returnPriceWithDecimals(pythPrice);
    }

    function _getPriceId(address token) internal view returns (bytes32) {
        require(token != address(0), "zero token address");
        bytes32 priceId = tokenPriceIds[token];
        require(priceId != 0, "unknown price id");
        return priceId;
    }

    function _returnPriceWithDecimals(
        PythStructs.Price memory pythPrice
    ) internal pure returns (uint256) {
        if (pythPrice.price <= 0) {
            revert("invalid price");
        }
        uint256 _decimals = pythPrice.expo < 0 ? uint256(uint32(-pythPrice.expo)) : uint256(uint32(pythPrice.expo));
        return uint256(uint64(pythPrice.price)) * (10 ** (PRICE_DECIMALS - _decimals));
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
