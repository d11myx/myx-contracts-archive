// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IPool {
    // Events
    event PairAdded(address indexed indexToken, address indexed stableToken, address lpToken, uint256 index);

    event UpdateTotalAmount(
        uint256 indexed pairIndex,
        int256 indexAmount,
        int256 stableAmount,
        uint256 indexTotalAmount,
        uint256 stableTotalAmount
    );

    event UpdateReserveAmount(
        uint256 indexed pairIndex,
        int256 indexAmount,
        int256 stableAmount,
        uint256 indexReservedAmount,
        uint256 stableReservedAmount
    );

    event UpdateLPProfit(uint256 indexed pairIndex, int256 profit, uint256 stableTotalAmount);

    event UpdateAveragePrice(uint256 indexed pairIndex, uint256 averagePrice);

    event Swap(
        address indexed funder,
        address indexed receiver,
        uint256 indexed pairIndex,
        bool isBuy, // buy indexToken with stableToken
        uint256 amountIn,
        uint256 amountOut
    );

    event AddLiquidity(
        address indexed funder,
        address indexed account,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount,
        uint256 indexFeeAmount,
        uint256 stableFeeAmount,
        address slipToken,
        uint256 slipFeeAmount
    );

    event RemoveLiquidity(
        address indexed account,
        address indexed receiver,
        uint256 indexed pairIndex,
        uint256 indexAmount,
        uint256 stableAmount,
        uint256 lpAmount
    );

    struct Vault {
        uint256 indexTotalAmount; // total amount of tokens
        uint256 indexReservedAmount; // amount of tokens reserved for open positions
        uint256 stableTotalAmount;
        uint256 stableReservedAmount;
        uint256 averagePrice;
    }

    struct Pair {
        uint256 pairIndex;
        address indexToken;
        address stableToken;
        address pairToken;
        bool enable;
        uint256 kOfSwap; //Initial k value of liquidity
        uint256 expectIndexTokenP; //   for 100%
        uint256 addLpFeeP; // Add liquidity fee
        uint256 lpFeeDistributeP;
    }

    struct TradingConfig {
        uint256 minLeverage;
        uint256 maxLeverage;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 maxPositionAmount;
        uint256 maintainMarginRate; // Maintain the margin rate of  for 100%
        uint256 priceSlipP; // Price slip point
        uint256 maxPriceDeviationP; // Maximum offset of index price
    }

    struct TradingFeeConfig {
        // fee
        uint256 takerFeeP;
        uint256 makerFeeP;
        // distribute
        uint256 lpFeeDistributeP;
        uint256 stakingFeeDistributeP;
        uint256 keeperFeeDistributeP;
    }

    struct FundingFeeConfig {
        int256 minFundingRate; // Minimum capital rate 1e8 for 100%
        int256 maxFundingRate; // The maximum capital rate is 1e8 for 100%
        uint256 fundingWeightFactor; // The weight coefficient of the fund rate of both sides is  for 100%
        uint256 liquidityPremiumFactor; // The coefficient of liquidity to premium is 1e8 for 100%
        int256 interest;
    }

    function getPairIndex(address indexToken, address stableToken) external view returns (uint256);

    function getPair(uint256) external view returns (Pair memory);

    function getTradingConfig(uint256 _pairIndex) external view returns (TradingConfig memory);

    function getTradingFeeConfig(uint256) external view returns (TradingFeeConfig memory);

    function getFundingFeeConfig(uint256) external view returns (FundingFeeConfig memory);

    function getVault(uint256 _pairIndex) external view returns (Vault memory vault);

    function transferTokenTo(address token, address to, uint256 amount) external;

    function increaseTotalAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;

    function decreaseTotalAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;

    function increaseReserveAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;

    function decreaseReserveAmount(uint256 _pairToken, uint256 _indexAmount, uint256 _stableAmount) external;

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external;

    function setLPProfit(uint256 _pairIndex, int256 _profit) external;

    // function decreaseLPProfit(uint256 _pairIndex, int256 _profit) external;

    // function liquitySwap(uint256 _pairIndex, bool _buyIndexToken, uint256 _amountIn, uint256 _amountOut) external;

    function addLiquidity(
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount);

    function addLiquidityForAccount(
        address _funder,
        address recipient,
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount,
        bytes calldata data
    ) external returns (uint256 mintAmount, address slipToken, uint256 slipAmount);

    function removeLiquidity(
        address _receiver,
        uint256 _pairIndex,
        uint256 _amount,
        bytes calldata data
    ) external returns (uint256 receivedIndexAmount, uint256 receivedStableAmount);

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut,
        bytes calldata data
    ) external returns (uint256 amountIn, uint256 amountOut);

    function swapForAccount(
        address _funder,
        address _receiver,
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _minOut,
        bytes calldata data
    ) external returns (uint256 amountIn, uint256 amountOut);

    function getMintLpAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    )
        external
        view
        returns (
            uint256 mintAmount,
            address slipToken,
            uint256 slipAmount,
            uint256 indexFeeAmount,
            uint256 stableFeeAmount,
            uint256 afterFeeIndexAmount,
            uint256 afterFeeStableAmount
        );
}
