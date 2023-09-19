// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPriceOracle {

    enum PriceType {ORACLE, INDEX}

    event OraclePriceFeedUpdated(address oldPriceFeed, address newPriceFeed);

    event IndexPriceFeedUpdated(address oldPriceFeed, address newPriceFeed);

    function updateOraclePriceFeed(address _oraclePriceFeed) external;

    function updateIndexPriceFeed(address _indexPriceFeed) external;

    function getOraclePrice(address token) external view returns (uint256);

    function getIndexPrice(address token) external view returns (uint256);

    function updateOraclePrice(address[] calldata tokens, uint256[] calldata prices) external payable;

    function updateIndexPrice(address[] calldata tokens, uint256[] calldata prices) external payable;

    function updatePrice(address[] calldata tokens, uint256[] calldata prices) external payable;

}
