import { PairInfoConfig } from '../shared/types';
import { ZERO_ADDRESS } from '../shared/constants';

export const btcPairInfo: PairInfoConfig = {
  pair: {
    indexToken: ZERO_ADDRESS,
    stableToken: ZERO_ADDRESS,
    pairToken: ZERO_ADDRESS,
    enable: true,
    kOfSwap: '100000000000000000000000000000000000000000000000000',
    initPairRatio: 1000,
    addLpFeeP: 100,
  },
  tradingConfig: {
    minLeverage: 2,
    maxLeverage: 100,
    minTradeAmount: '1000000000000000000',
    maxTradeAmount: '100000000000000000000000',
    maintainMarginRate: 1000,
  },
  tradingFeeConfig: {
    takerFeeP: 100, // 1%
    makerFeeP: 100,
    lpDistributeP: 0,
    keeperDistributeP: 0,
    treasuryDistributeP: 0,
    refererDistributeP: 0,
  },
  fundingFeeConfig: {
    minFundingRate: 100,
    maxFundingRate: 10000,
    fundingWeightFactor: 100,
    liquidityPremiumFactor: 10000,
    interest: 0,
    lpDistributeP: 0,
    userDistributeP: 0,
    treasuryDistributeP: 0,
  },
};

export const ethPairInfo: PairInfoConfig = {
  pair: {
    indexToken: ZERO_ADDRESS,
    stableToken: ZERO_ADDRESS,
    pairToken: ZERO_ADDRESS,
    enable: true,
    kOfSwap: '100000000000000000000000000000000000000000000000000',
    initPairRatio: 1000,
    addLpFeeP: 100,
  },
  tradingConfig: {
    minLeverage: 2,
    maxLeverage: 100,
    minTradeAmount: '1000000000000000000',
    maxTradeAmount: '100000000000000000000000',
    maintainMarginRate: 1000,
  },
  tradingFeeConfig: {
    takerFeeP: 100, // 1%
    makerFeeP: 100,
    lpDistributeP: 0,
    keeperDistributeP: 0,
    treasuryDistributeP: 0,
    refererDistributeP: 0,
  },
  fundingFeeConfig: {
    minFundingRate: 100,
    maxFundingRate: 10000,
    fundingWeightFactor: 100,
    liquidityPremiumFactor: 10000,
    interest: 0,
    lpDistributeP: 0,
    userDistributeP: 0,
    treasuryDistributeP: 0,
  },
};
