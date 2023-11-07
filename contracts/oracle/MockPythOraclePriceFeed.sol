// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IPythOraclePriceFeed.sol";
import "../interfaces/IRoleManager.sol";

contract MockPythOraclePriceFeed is IPythOraclePriceFeed {
    IAddressesProvider public immutable ADDRESS_PROVIDER;
    uint256 public immutable PRICE_DECIMALS = 30;
    IPyth public pyth;
    mapping(address => bytes32) public tokenPriceIds;

    constructor(
        IAddressesProvider addressProvider,
        address _pyth,
        address[] memory assets,
        bytes32[] memory priceIds
    ) {
        ADDRESS_PROVIDER = addressProvider;
        pyth = IPyth(_pyth);
        _setAssetPriceIds(assets, priceIds);
    }

    modifier onlyTimelock() {
        require(msg.sender == ADDRESS_PROVIDER.timelock(), "only timelock");
        _;
    }

    function updatePythAddress(IPyth _pyth) external onlyTimelock {
        address oldAddress = address(pyth);
        pyth = _pyth;
        emit PythAddressUpdated(oldAddress, address(_pyth));
    }

    function setTokenPriceIds(
        address[] memory assets,
        bytes32[] memory priceIds
    ) external onlyTimelock {
        _setAssetPriceIds(assets, priceIds);
    }

    function updatePrice(
        address[] calldata tokens,
        bytes[] calldata _updateData
    ) external payable override {
        uint256[] memory prices = new uint256[](_updateData.length);
        for (uint256 i = 0; i < _updateData.length; i++) {
            prices[i] = abi.decode(_updateData[i], (uint256));
        }
        bytes[] memory updateData = getUpdateData(tokens, prices);

        uint fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) {
            revert("insufficient fee");
        }

        pyth.updatePriceFeeds{value: fee}(updateData);
    }

    function _setAssetPriceIds(address[] memory assets, bytes32[] memory priceIds) private {
        require(assets.length == priceIds.length, "inconsistent params length");
        for (uint256 i = 0; i < assets.length; i++) {
            tokenPriceIds[assets[i]] = priceIds[i];
        }
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
        return _returnPriceWithDecimals(pythPrice);
    }

    function _getPriceId(address token) internal view returns (bytes32) {
        bytes32 priceId = tokenPriceIds[token];
        if (priceId == 0) {
            revert("price feed not found");
        }
        return priceId;
    }

    function _returnPriceWithDecimals(
        PythStructs.Price memory pythPrice
    ) internal view returns (uint256) {
        if (pythPrice.price < 0) {
            return 0;
        }
        return uint256(uint64(pythPrice.price)) * (10 ** (PRICE_DECIMALS - 8));
    }

    function getUpdateData(
        address[] memory tokens,
        uint256[] memory prices
    ) public view returns (bytes[] memory updateData) {
        require(tokens.length == prices.length, "inconsistent params length");

        updateData = new bytes[](prices.length);

        for (uint256 i = 0; i < prices.length; i++) {
            bytes32 id = tokenPriceIds[tokens[i]];
            int64 price = int64(int256(prices[i]));
            uint64 conf = 0;
            int32 expo = 0;
            int64 emaPrice = int64(int256(prices[i]));
            uint64 emaConf = 0;
            uint64 publishTime = uint64(block.timestamp);
            updateData[i] = createPriceFeedUpdateData(
                id,
                price,
                conf,
                expo,
                emaPrice,
                emaConf,
                publishTime
            );
        }
    }

    function decimals() public pure returns (uint256) {
        return PRICE_DECIMALS;
    }

    function createPriceFeedUpdateData(
        bytes32 id,
        int64 price,
        uint64 conf,
        int32 expo,
        int64 emaPrice,
        uint64 emaConf,
        uint64 publishTime
    ) public pure returns (bytes memory) {
        PythStructs.PriceFeed memory priceFeed;

        priceFeed.id = id;

        priceFeed.price.price = price;
        priceFeed.price.conf = conf;
        priceFeed.price.expo = expo;
        priceFeed.price.publishTime = publishTime;

        priceFeed.emaPrice.price = emaPrice;
        priceFeed.emaPrice.conf = emaConf;
        priceFeed.emaPrice.expo = expo;
        priceFeed.emaPrice.publishTime = publishTime;

        return abi.encode(priceFeed);
    }
}
