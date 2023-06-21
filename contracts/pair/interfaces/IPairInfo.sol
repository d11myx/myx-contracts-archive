// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IPairInfo {

    struct Pair {
        address indexToken;
        address stableToken;
        address pairToken;
        uint256 spreadP;
        uint256 k;
        uint256 minLeverage;
        uint256 maxLeverage;
        uint256 maxCollateralP;
        bool enable;
        Fee fee;
    }

    struct Fee {
        uint256 openFeeP;              // PRECISION (% of leveraged pos)
        uint256 closeFeeP;             // PRECISION (% of leveraged pos)
        uint256 oracleFeeP;            // PRECISION (% of leveraged pos)
        uint256 nftLimitOrderFeeP;     // PRECISION (% of leveraged pos)
        uint256 referralFeeP;          // PRECISION (% of leveraged pos)
        uint256 minLevPosDai;          // 1e18 (collateral x leverage, useful for min fee)
        uint256 depositFeeP;
    }

    function pairIndexes(address, address) external view returns(uint256);

    function getPair(uint256) external view returns(Pair memory);

    function isPairListed(address, address) external view returns (bool);

    function pairsCount() external view returns (uint256);

}