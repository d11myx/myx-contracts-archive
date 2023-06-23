// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IPairInfo {

    struct Pair {
        address indexToken;
        address stableToken;
        address pairToken;
        bool enable;
        uint256 kOfSwap;
        uint256 initPairRatio; // index / stable PRECISION 1% for 1e10
        Fee fee;
        TradingFeeDistribute tradingFeeDistribute;
        FundingFeeDistribute fundingFeeDistribute;
    }

    struct Fee {
        uint256 takerFeeP;
        int256 makerFeeP;
        uint256 addLpFeeP;
    }

    struct TradingFeeDistribute {
        uint256 lpP;
        uint256 keeperP;
        uint256 treasuryP;
        uint256 refererP;
    }

    struct FundingFeeDistribute {
        uint256 lpP;
        uint256 userP;
        uint256 treasuryP;
    }

    function pairIndexes(address, address) external view returns(uint256);

    function isPairListed(address, address) external view returns (bool);

    function pairsCount() external view returns (uint256);

    function getPair(uint256) external view returns(Pair memory);

    function getFee(uint256) external view returns(Fee memory);

    function getTradingFeeDistribute(uint256) external view returns(TradingFeeDistribute memory);

    function getFundingFeeDistribute(uint256) external view returns(FundingFeeDistribute memory);

}