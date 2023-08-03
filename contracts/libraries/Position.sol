// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../libraries/type/TradingTypes.sol";
import "../libraries/PositionKey.sol";

library Position {

     struct Info {
        bytes32 key;
        address account;
        uint256 pairIndex;
        bool isLong;
        uint256 collateral;
        uint256 positionAmount;
        uint256 averagePrice;
        int256 entryFundingRate;
        uint256 entryFundingTime;
        int256 realisedPnl;
    }

     function get(
        mapping(bytes32 => Info) storage self,
       address _account, uint256 _pairIndex, bool _isLong
    ) internal view returns (Position.Info storage position) {
        position = self[PositionKey.getPositionKey(_account, _pairIndex, _isLong)];
    }
    function getPositionByKey(mapping(bytes32 => Info) storage self,bytes32 key)internal view returns (Position.Info storage position){
         position = self[key];

    }


}
