// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../libraries/Position.sol";
import "../interfaces/IPositionManager.sol";
import "../interfaces/IPool.sol";


contract PositionCaller {
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    struct FundingFeeParam {
        address account;
        uint256 pairIndex;
        bool isLong;
    }

    struct TradingFeeParam{
        uint256 pairIndex;
        bool isLong;
        uint256 sizeAmount;
        uint256 price;
    }

    address public positionManager;
    address public pool;

    constructor( address _positionManager, address _pool ){
        positionManager = _positionManager;
        pool = _pool;
    }

    function getFundingFees(
        FundingFeeParam[] memory params
    ) public view returns (int256[] memory) {
        int256[] memory fundingFees = new int256[](params.length);
        for (uint256 i = 0; i < params.length; i++) {
            FundingFeeParam memory fundingFeeParam = params[i];
            int256 fundingFee = IPositionManager(positionManager).getFundingFee(fundingFeeParam.account, fundingFeeParam.pairIndex, fundingFeeParam.isLong);
            fundingFees[i] = fundingFee;
        }
        return fundingFees;
    }

    function getTradingFees(
        TradingFeeParam[] memory params
    ) public view returns (uint256[] memory) {
        uint256[] memory tradingFees = new uint256[](params.length);
        for (uint256 i = 0; i < params.length; i++) {
            TradingFeeParam memory tradingFeeParam = params[i];
            uint256 fundingFee = IPositionManager(positionManager).getTradingFee(tradingFeeParam.pairIndex, tradingFeeParam.isLong, tradingFeeParam.sizeAmount, tradingFeeParam.price);
            tradingFees[i] = fundingFee;
        }
        return tradingFees;
    }

}