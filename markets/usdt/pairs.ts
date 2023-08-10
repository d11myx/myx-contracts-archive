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
        minLeverage: 1,
        maxLeverage: 100,
        minTradeAmount: '100000000000000000',
        maxTradeAmount: '100000000000000000000000',
        maxPositionAmount: '100000000000000000000000000',
        maintainMarginRate: 1000,
        priceSlipP: 100,
        maxPriceDeviationP: 50,
    },
    tradingFeeConfig: {
        takerFeeP: 10, // 0.1%
        makerFeeP: 10,
        lpDistributeP: 0,
        keeperDistributeP: 0,
        treasuryDistributeP: 10000,
        refererDistributeP: 0,
    },
    fundingFeeConfig: {
        minFundingRate: 100,
        maxFundingRate: 10000,
        defaultFundingRate: 1000000,
        fundingWeightFactor: 100,
        liquidityPremiumFactor: 10000,
        interest: 0,
        lpDistributeP: 0,
        userDistributeP: 10000,
        treasuryDistributeP: 0,
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
        minLeverage: 1,
        maxLeverage: 100,
        minTradeAmount: '100000000000000000',
        maxTradeAmount: '100000000000000000000000',
        maxPositionAmount: '100000000000000000000000000',
        maintainMarginRate: 1000,
        priceSlipP: 100,
        maxPriceDeviationP: 50,
    },
    tradingFeeConfig: {
        takerFeeP: 10, // 0.1%
        makerFeeP: 10,
        lpDistributeP: 0,
        keeperDistributeP: 0,
        treasuryDistributeP: 10000,
        refererDistributeP: 0,
    },
    fundingFeeConfig: {
        minFundingRate: 100,
        maxFundingRate: 10000,
        defaultFundingRate: 1000000,
        fundingWeightFactor: 100,
        liquidityPremiumFactor: 10000,
        interest: 0,
        lpDistributeP: 0,
        userDistributeP: 10000,
        treasuryDistributeP: 0,
    },
};
