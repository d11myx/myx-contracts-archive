import { PairInfoConfig } from '../../helpers';
import { ZERO_ADDRESS } from '../../helpers';
import { ethers } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
    pairTokenDecimals: 8,
    useWrappedNativeToken: false,
    pair: {
        pairIndex: 1,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('4.4', 46),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 200000, //0.2%
        addLpFeeP: 50000, //0.05%
        removeLpFeeP: 100000, //0.1%
    },
    tradingConfig: {
        minLeverage: 1,
        maxLeverage: 50,
        minTradeAmount: ethers.utils.parseUnits('0.0025', 8), //0.0025
        maxTradeAmount: ethers.utils.parseUnits('50', 8), //50
        maxPositionAmount: ethers.utils.parseUnits('50', 8), //50
        maintainMarginRate: 1000000, //1%
        priceSlipP: 0, //0%
        maxPriceDeviationP: 150000, //0.15%
    },
    tradingFeeConfig: {
        takerFee: 40000, //0.04%
        makerFee: 20000, //0.02%
        lpFeeDistributeP: 40000000, //40%
        keeperFeeDistributeP: 1000000, //1%
        stakingFeeDistributeP: 0, //0%
        treasuryFeeDistributeP: 25000000, //25%
        reservedFeeDistributeP: 30000000, //30%
        ecoFundFeeDistributeP: 4000000, //4%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 30000, //0.0003
        maxRate: 1000000, //0.01
        fundingInterval: 60 * 60,
    },
};

export const ethPairInfo: PairInfoConfig = {
    pairTokenDecimals: 18,
    useWrappedNativeToken: true,
    pair: {
        pairIndex: 2,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('4', 49),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 200000, //0.2%
        addLpFeeP: 50000, //0.05%
        removeLpFeeP: 100000, //0.1%
    },
    tradingConfig: {
        minLeverage: 1,
        maxLeverage: 50,
        minTradeAmount: ethers.utils.parseUnits('0.045', 18), //0.045
        maxTradeAmount: ethers.utils.parseUnits('30', 18), //30
        maxPositionAmount: ethers.utils.parseUnits('30', 18), //30
        maintainMarginRate: 1000000, //1%
        priceSlipP: 0, //0%
        maxPriceDeviationP: 150000, //0.15%
    },
    tradingFeeConfig: {
        takerFee: 40000, //0.04%
        makerFee: 20000, //0.02%
        lpFeeDistributeP: 40000000, //40%
        keeperFeeDistributeP: 1000000, //1%
        stakingFeeDistributeP: 0, //0%
        treasuryFeeDistributeP: 25000000, //25%
        reservedFeeDistributeP: 30000000, //30%
        ecoFundFeeDistributeP: 4000000, //4%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 30000, //0.0003
        maxRate: 1000000, //0.01
        fundingInterval: 60 * 60,
    },
};
