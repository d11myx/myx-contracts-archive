import { PairInfoConfig } from '../../helpers/types';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { ethers } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
    pair: {
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 5000,
        addLpFeeP: 100,
    },
    tradingConfig: {
        minLeverage: 0,
        maxLeverage: 100,
        minTradeAmount: '100000000000000000',
        maxTradeAmount: '100000000000000000000000',
        maxPositionAmount: '100000000000000000000000000',
        maintainMarginRate: 100,
        priceSlipP: 5,
        maxPriceDeviationP: 50,
    },
    tradingFeeConfig: {
        takerFeeP: 30, // 0.3%
        makerFeeP: 10,
    },
    fundingFeeConfig: {
        minFundingRate: 0,
        maxFundingRate: 0,
        defaultFundingRate: 100,
        fundingWeightFactor: 100,
        liquidityPremiumFactor: 10000,
        interest: 0,
        lpDistributeP: 5000,
    },
};

export const ethPairInfo: PairInfoConfig = {
    pair: {
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 5000,
        addLpFeeP: 100,
    },
    tradingConfig: {
        minLeverage: 0,
        maxLeverage: 100,
        minTradeAmount: '100000000000000000',
        maxTradeAmount: '100000000000000000000000',
        maxPositionAmount: '100000000000000000000000000',
        maintainMarginRate: 100,
        priceSlipP: 5,
        maxPriceDeviationP: 50,
    },
    tradingFeeConfig: {
        takerFeeP: 30, // 0.3%
        makerFeeP: 10,
    },
    fundingFeeConfig: {
        minFundingRate: 0,
        maxFundingRate: 0,
        defaultFundingRate: 100,
        fundingWeightFactor: 100,
        liquidityPremiumFactor: 10000,
        interest: 0,
        lpDistributeP: 5000,
    },
};
