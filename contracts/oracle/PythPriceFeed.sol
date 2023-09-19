// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "../interfaces/IPythPriceFeed.sol";

contract PythPriceFeed is IPythPriceFeed {

    IPyth public pyth;
    mapping(address => bytes32) public assetIds;

    constructor(address _pyth, address[] memory assets, bytes32[] memory priceIds) {
        pyth = IPyth(_pyth);
        _setAssetPriceIds(assets, priceIds);
    }

    function decimals() external view override returns (uint256) {
        return 8;
    }

    function updatePythAddress(IPyth _pyth) external override {
        address oldAddress = address(pyth);
        pyth = _pyth;
        emit PythAddressUpdated(oldAddress, address(pyth));
    }

    function setAssetPriceIds(address[] memory assets, bytes32[] memory priceIds) external override {
        _setAssetPriceIds(assets, priceIds);
    }

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable override {
        bytes[] memory updateData = _getUpdateData(tokens, prices);

        uint fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) {
            revert('insufficient fee');
        }
        pyth.updatePriceFeeds{value: fee}(updateData);
    }

    function getPrice(address token) external view override returns (uint256) {
        bytes32 priceId = assetIds[token];
        if (priceId == 0) {
            revert('price feed not found');
        }
        PythStructs.Price memory pythPrice = _getPrice(priceId);
        if (pythPrice.price < 0) {
            return 0;
        }
        return uint256(uint64(pythPrice.price));
    }

    function _setAssetPriceIds(address[] memory assets, bytes32[] memory priceIds) public {
        require(assets.length == priceIds.length, "inconsistent params length");
        for (uint256 i = 0; i < assets.length; i++) {
            assetIds[assets[i]] = priceIds[i];
            emit AssetPriceIdUpdated(assets[i], priceIds[i]);
        }
    }

    function _getUpdateData(
        address[] calldata tokens,
        uint256[] calldata prices
    ) internal view returns (bytes[] memory updateData) {
        require(tokens.length == prices.length, "inconsistent params length");

        updateData = new bytes[](prices.length);

        for (uint256 i = 0; i < prices.length; i++) {
            bytes32 id = assetIds[tokens[i]];
            int64 price = int64(int256(prices[i]));
            uint64 conf = 0;
            int32 expo = 0;
            int64 emaPrice = int64(int256(prices[i]));
            uint64 emaConf = 0;
            uint64 publishTime = uint64(block.timestamp);
            updateData[i] = createPriceFeedUpdateData(id, price, conf, expo, emaPrice, emaConf, publishTime);
        }
    }

    function _getPrice(bytes32 priceId) internal view returns (PythStructs.Price memory) {
        return pyth.getPrice(priceId);
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
