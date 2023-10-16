// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPriceOracle {
    enum PriceType {
        ORACLE,
        INDEX
    }

    event OraclePriceFeedUpdated(address oldPriceFeed, address newPriceFeed);

    event IndexPriceFeedUpdated(address oldPriceFeed, address newPriceFeed);

    function getUpdateFee(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external view returns (uint);

    function updateOraclePrice(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external payable;

    function updateIndexPrice(address[] calldata tokens, uint256[] calldata prices) external;

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable;
}
