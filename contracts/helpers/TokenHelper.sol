// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../libraries/PrecisionUtils.sol";
import "../interfaces/IPool.sol";

library TokenHelper {
    using PrecisionUtils for uint256;
    using SafeMath for uint256;

    function convertIndexAmountToStable(
        IPool.Pair memory pair,
        int256 indexTokenAmount
    ) internal view returns (int256 amount) {
        uint256 indexTokenDec = uint256(IERC20Metadata(pair.indexToken).decimals());
        uint256 stableTokenDec = uint256(IERC20Metadata(pair.stableToken).decimals());

        uint256 indexTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - indexTokenDec);
        uint256 stableTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - stableTokenDec);

        amount = (indexTokenAmount * int256(indexTokenWad)) / int256(stableTokenWad);
    }

    // function convertIndexAmountToStableWithPrice(
    //     IPool.Pair memory pair,
    //     int256 indexTokenAmount,
    //     uint256 price
    // ) internal view returns (int256 amount) {
    //     uint256 indexTokenDec = uint256(IERC20Metadata(pair.indexToken).decimals());
    //     uint256 stableTokenDec = uint256(IERC20Metadata(pair.stableToken).decimals());

    //     uint256 indexTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - indexTokenDec);
    //     uint256 stableTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - stableTokenDec);

    //     amount =
    //         ((indexTokenAmount * int256(price) * int256(indexTokenWad)) /
    //             int256(PrecisionUtils.PRICE_PRECISION)) *
    //         int256(stableTokenWad);
    // }

    function convertStableAmountToIndex(
        IPool.Pair memory pair,
        int256 stableTokenAmount
    ) internal view returns (int256 amount) {
        uint256 indexTokenDec = uint256(IERC20Metadata(pair.indexToken).decimals());
        uint256 stableTokenDec = uint256(IERC20Metadata(pair.stableToken).decimals());

        uint256 indexTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - indexTokenDec);
        uint256 stableTokenWad = 10 ** (PrecisionUtils.maxTokenDecimals() - stableTokenDec);

        amount = (stableTokenAmount * int256(stableTokenWad)) / int256(indexTokenWad);
    }
}
