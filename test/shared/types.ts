import { IPairInfo } from '../../types/ethers-contracts';

export interface PairInfo {
  pair: IPairInfo.PairStruct;
  tradingConfig: IPairInfo.TradingConfigStruct;
  tradingFeeConfig: IPairInfo.TradingFeeConfigStruct;
  fundingFeeConfig: IPairInfo.FundingFeeConfigStruct;
}

export interface Pair {
  [symbol: string]: PairInfo;
}
