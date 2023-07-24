import { PairInfoConfig } from '../shared/types';
import { ZERO_ADDRESS } from '../shared/constants';
import { BigNumber } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
  pair: {
    indexToken: ZERO_ADDRESS,
    stableToken: ZERO_ADDRESS,
    pairToken: ZERO_ADDRESS,
    enable: true,
    kOfSwap: BigNumber.from('100000000000000000000000000000000000000000000000000'),
    initPairRatio: BigNumber.from('1000'),
    addLpFeeP: BigNumber.from('100'),
  },
  tradingConfig: {
    minLeverage: BigNumber.from('2'),
    maxLeverage: BigNumber.from('100'),
    minTradeAmount: BigNumber.from('1000000000000000000'),
    maxTradeAmount: BigNumber.from('100000000000000000000000'),
    maintainMarginRate: BigNumber.from('1000'),
  },
  tradingFeeConfig: {
    takerFeeP: BigNumber.from('100'), // 1%
    makerFeeP: BigNumber.from('100'),
    lpDistributeP: BigNumber.from('0'),
    keeperDistributeP: BigNumber.from('0'),
    treasuryDistributeP: BigNumber.from('0'),
    refererDistributeP: BigNumber.from('0'),
  },
  fundingFeeConfig: {
    minFundingRate: BigNumber.from('100'),
    maxFundingRate: BigNumber.from('10000'),
    fundingWeightFactor: BigNumber.from('100'),
    liquidityPremiumFactor: BigNumber.from('10000'),
    interest: BigNumber.from('0'),
    lpDistributeP: BigNumber.from('0'),
    userDistributeP: BigNumber.from('0'),
    treasuryDistributeP: BigNumber.from('0'),
  },
};

export const ethPairInfo: PairInfoConfig = {
  pair: {
    indexToken: ZERO_ADDRESS,
    stableToken: ZERO_ADDRESS,
    pairToken: ZERO_ADDRESS,
    enable: true,
    kOfSwap: BigNumber.from('100000000000000000000000000000000000000000000000000'),
    initPairRatio: BigNumber.from('1000'),
    addLpFeeP: BigNumber.from('100'),
  },
  tradingConfig: {
    minLeverage: BigNumber.from('2'),
    maxLeverage: BigNumber.from('100'),
    minTradeAmount: BigNumber.from('1000000000000000000'),
    maxTradeAmount: BigNumber.from('100000000000000000000000'),
    maintainMarginRate: BigNumber.from('1000'),
  },
  tradingFeeConfig: {
    takerFeeP: BigNumber.from('100'), // 1%
    makerFeeP: BigNumber.from('100'),
    lpDistributeP: BigNumber.from('0'),
    keeperDistributeP: BigNumber.from('0'),
    treasuryDistributeP: BigNumber.from('0'),
    refererDistributeP: BigNumber.from('0'),
  },
  fundingFeeConfig: {
    minFundingRate: BigNumber.from('100'),
    maxFundingRate: BigNumber.from('10000'),
    fundingWeightFactor: BigNumber.from('100'),
    liquidityPremiumFactor: BigNumber.from('10000'),
    interest: BigNumber.from('0'),
    lpDistributeP: BigNumber.from('0'),
    userDistributeP: BigNumber.from('0'),
    treasuryDistributeP: BigNumber.from('0'),
  },
};
