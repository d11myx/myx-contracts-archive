import { IPairInfo } from '../../types';
import { eNetwork } from './constants';

export interface SymbolMap<T> {
    [symbol: string]: T;
}

export type ParamsPerNetwork<T> = {
    [k in eNetwork]?: T;
};

export interface PairInfoConfig {
    pair: IPairInfo.PairStruct;
    tradingConfig: IPairInfo.TradingConfigStruct;
    tradingFeeConfig: IPairInfo.TradingFeeConfigStruct;
    fundingFeeConfig: IPairInfo.FundingFeeConfigStruct;
}

export interface MarketConfiguration {
    [symbol: string]: ReserveConfiguration;
}

export interface ReserveConfiguration {
    TokenName: string;
    TokenAddress: ParamsPerNetwork<string>;
    PairsConfig: SymbolMap<PairInfoConfig>;
    PairAssets: ParamsPerNetwork<SymbolMap<string>>;
}
