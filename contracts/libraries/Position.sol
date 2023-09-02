// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/math/Math.sol';
import '../libraries/PrecisionUtils.sol';
import '../libraries/Int256Utils.sol';
import '../libraries/TradingTypes.sol';
import '../libraries/PositionKey.sol';

// import 'hardhat/console.sol';

library Position {
    using Int256Utils for int256;
    using Math for uint256;
    using PrecisionUtils for uint256;

    struct Info {
        address account;
        uint256 pairIndex;
        bool isLong;
        uint256 collateral;
        uint256 positionAmount;
        uint256 averagePrice;
        int256 fundingFeeTracker;
    }

    function get(
        mapping(bytes32 => Info) storage self,
        address _account,
        uint256 _pairIndex,
        bool _isLong
    ) internal view returns (Position.Info storage position) {
        position = self[PositionKey.getPositionKey(_account, _pairIndex, _isLong)];
    }

    function getPositionByKey(
        mapping(bytes32 => Info) storage self,
        bytes32 key
    ) internal view returns (Position.Info storage position) {
        position = self[key];
    }

    function init(Info storage self, uint256 pairIndex, address account, bool isLong, uint256 oraclePrice) internal {
        self.pairIndex = pairIndex;
        self.account = account;
        self.isLong = isLong;
        self.averagePrice = oraclePrice;
    }

    function getUnrealizedPnl(Info memory self, uint256 _sizeAmount, uint256 price) internal pure returns (int256 pnl) {
        if (price == self.averagePrice || self.averagePrice == 0) {
            return 0;
        }

        if (self.isLong) {
            if (price > self.averagePrice) {
                pnl = int256(_sizeAmount.mulPrice(price - self.averagePrice));
            } else {
                pnl = -int256(_sizeAmount.mulPrice(self.averagePrice - price));
            }
        } else {
            if (self.averagePrice > price) {
                pnl = int256(_sizeAmount.mulPrice(self.averagePrice - price));
            } else {
                pnl = -int256(_sizeAmount.mulPrice(price - self.averagePrice));
            }
        }

        return pnl;
    }

    function validLeverage(
        Info memory self,
        uint256 price,
        int256 _collateral,
        uint256 _sizeAmount,
        bool _increase,
        uint256 maxLeverage,
        uint256 maxPositionAmount
    ) internal pure returns (uint256, uint256) {
        // position >= decrease size
        require(_increase ? true : self.positionAmount >= _sizeAmount, 'decrease amount exceed position');

        uint256 afterPosition = _increase ? self.positionAmount + _sizeAmount : self.positionAmount - _sizeAmount;

        // close position
        if (afterPosition == 0) {
            return (0, 0);
        }

        // check collateral
        int256 totalCollateral = int256(self.collateral) + _collateral;
        require(totalCollateral >= 0, 'collateral not enough for decrease');

        // pnl
        if (_sizeAmount > 0) {
            totalCollateral += getUnrealizedPnl(self, _sizeAmount, price);
        }

        require(totalCollateral >= 0, 'collateral not enough for pnl');

        require(afterPosition <= totalCollateral.abs().divPrice(price) * maxLeverage, 'exceed max leverage');
        // require(afterPosition > totalCollateral.abs().divPrice(price) * minLeverage, 'exceed min leverage');
        require(afterPosition <= maxPositionAmount, 'exceed max position');

        return (afterPosition, totalCollateral.abs());
    }
}
