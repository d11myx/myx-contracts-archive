import { PairInfoConfig } from '../../helpers';
import { ZERO_ADDRESS } from '../../helpers';
import { ethers } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
    pair: {
        pairIndex: 0,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 50000000, //50%
        addLpFeeP: 1000000, //1%
        lpFeeDistributeP: 100000000,
    },
    tradingConfig: {
        minLeverage: 3,
        maxLeverage: 50,
        minTradeAmount: '100000000000000000', //0.1
        maxTradeAmount: '100000000000000000000000', //100000
        maxPositionAmount: '100000000000000000000000000', //100000000
        maintainMarginRate: 1000000, //0.01%
        priceSlipP: 50000, //0.05%
        maxPriceDeviationP: 500000, //0.5%
    },
    tradingFeeConfig: {
        takerFeeP: 80000, //0.08%
        makerFeeP: 50000, //0.05%
        lpFeeDistributeP: 30000000, //30%
        keeperFeeDistributeP: 20000000, //20%
        stakingFeeDistributeP: 10000000, //10%
    },
    fundingFeeConfig: {
        minFundingRate: 0,
        maxFundingRate: 0,
        defaultFundingRate: 1000000, //1%
        fundingWeightFactor: 1000000, //1%
        liquidityPremiumFactor: 100000000, //100%
        interest: 0,
    },
};

export const ethPairInfo: PairInfoConfig = {
    pair: {
        pairIndex: 1,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 50000000, //50%
        addLpFeeP: 1000000, //1%
        lpFeeDistributeP: 100000000,
    },
    tradingConfig: {
        minLeverage: 3,
        maxLeverage: 50,
        minTradeAmount: '100000000000000000', //0.1
        maxTradeAmount: '100000000000000000000000', //100000
        maxPositionAmount: '100000000000000000000000000', //100000000
        maintainMarginRate: 1000000, //0.01%
        priceSlipP: 50000, //0.05%
        maxPriceDeviationP: 500000, //0.5%
    },
    tradingFeeConfig: {
        takerFeeP: 80000, //0.08%
        makerFeeP: 50000, //0.05%
        lpFeeDistributeP: 30000000, //30%
        keeperFeeDistributeP: 20000000, //20%
        stakingFeeDistributeP: 10000000, //10%
    },
    fundingFeeConfig: {
        minFundingRate: 0,
        maxFundingRate: 0,
        defaultFundingRate: 1000000, //1%
        fundingWeightFactor: 1000000, //1%
        liquidityPremiumFactor: 100000000, //100%
        interest: 0,
        lpDistributeP: 50000000, //50%
    },
};
