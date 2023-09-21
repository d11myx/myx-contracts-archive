// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IPriceOracle.sol";
import "../interfaces/IOraclePriceFeed.sol";
import "../interfaces/IIndexPriceFeed.sol";

contract PriceOracle is IPriceOracle {

    uint256 public immutable PRICE_DECIMALS = 30;

    IOraclePriceFeed public oraclePriceFeed;
    IIndexPriceFeed public indexPriceFeed;

    constructor(IOraclePriceFeed _oraclePriceFeed, IIndexPriceFeed _indexPriceFeed) {
        oraclePriceFeed = _oraclePriceFeed;
        indexPriceFeed = _indexPriceFeed;
    }

    function updateOraclePriceFeed(address _oraclePriceFeed) external override {
        address oldPriceFeed = address(oraclePriceFeed);
        oraclePriceFeed = IOraclePriceFeed(_oraclePriceFeed);

        emit OraclePriceFeedUpdated(oldPriceFeed, address(oraclePriceFeed));
    }

    function updateIndexPriceFeed(address _indexPriceFeed) external override {
        address oldPriceFeed = address(indexPriceFeed);
        indexPriceFeed = IIndexPriceFeed(_indexPriceFeed);

        emit IndexPriceFeedUpdated(oldPriceFeed, address(indexPriceFeed));
    }

    function getOraclePrice(address token) external view override returns (uint256) {
        return _getPrice(token, PriceType.ORACLE);
    }

    function getIndexPrice(address token) external view override returns (uint256) {
        return _getPrice(token, PriceType.INDEX);
    }

    function getUpdateFee(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view returns (uint) {
        return oraclePriceFeed.getUpdateFee(tokens, prices);
    }

    function updateOraclePrice(address[] calldata tokens, uint256[] calldata prices) external payable override {
        require(tokens.length == prices.length, 'inconsistent params length');

        if (tokens.length == 0) {
            return;
        }
        oraclePriceFeed.updatePrice{value: msg.value}(tokens, prices);
    }

    function updateIndexPrice(address[] calldata tokens, uint256[] calldata prices) external override {
        require(tokens.length == prices.length, 'inconsistent params length');

        if (tokens.length == 0) {
            return;
        }
        indexPriceFeed.updatePrice(tokens, prices);
    }

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable override {
        require(tokens.length == prices.length, 'inconsistent params length');
        if (tokens.length == 0) {
            return;
        }

        this.updateIndexPrice(tokens, prices);
        this.updateOraclePrice{value: msg.value}(tokens, prices);
    }

    function _getPrice(address token, PriceType priceType) internal view returns (uint256 price) {
        if (priceType == PriceType.INDEX) {
            price = indexPriceFeed.getPrice(token) * (10 ** (PRICE_DECIMALS - indexPriceFeed.decimals()));
        } else if (priceType == PriceType.ORACLE) {
            price = oraclePriceFeed.getPrice(token) * (10 ** (PRICE_DECIMALS - oraclePriceFeed.decimals()));
        } else {
            revert('unknown price type');
        }
    }
}
