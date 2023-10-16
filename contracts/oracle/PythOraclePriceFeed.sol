// SPDX-License-Identifier: UNLICENSED
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
    mapping(address => bytes32) public assetIds;

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
    modifier onlyKeeper() {
        require(IRoleManager(ADDRESS_PROVIDER.roleManager()).isKeeper(tx.origin), "opk");
        _;
    }

    function updatePythAddress(IPyth _pyth) external override onlyTimelock {
        address oldAddress = address(pyth);
        pyth = _pyth;
        emit PythAddressUpdated(oldAddress, address(pyth));
    }

    function setAssetPriceIds(
        address[] memory assets,
        bytes32[] memory priceIds
    ) external override onlyTimelock {
        _setAssetPriceIds(assets, priceIds);
    }

    function updatePrice(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external payable override onlyKeeper {
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
            assetIds[assets[i]] = priceIds[i];
            emit AssetPriceIdUpdated(assets[i], priceIds[i]);
        }
    }

    function getPrice(address token) external view override returns (uint256) {
        bytes32 priceId = assetIds[token];
        if (priceId == 0) {
            revert("price feed not found");
        }
        PythStructs.Price memory pythPrice = _getPrice(priceId);
        if (pythPrice.price < 0) {
            return 0;
        }
        return uint256(uint64(pythPrice.price)) * (10 ** (PRICE_DECIMALS - decimals()));
    }

    function getUpdateData(
        address[] calldata tokens,
        uint256[] calldata prices
    ) public view returns (bytes[] memory updateData) {
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

    function getUpdateFee(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view override returns (uint) {
        return pyth.getUpdateFee(getUpdateData(tokens, prices));
    }

    function _getPrice(bytes32 priceId) internal view returns (PythStructs.Price memory) {
        return pyth.getPriceUnsafe(priceId);
    }

    function decimals() public pure override returns (uint256) {
        return 8;
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
