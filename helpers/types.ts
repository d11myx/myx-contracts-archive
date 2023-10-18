import { IPool } from '../types';
import { eNetwork } from './constants';
import type { BigNumberish } from 'ethers';
import type { PromiseOrValue } from '../types/common';
import { IFundingRate } from '../types/contracts/core/FundingRate';

export interface SymbolMap<T> {
    [symbol: string]: T;
}

export type ParamsPerNetwork<T> = {
    [k in eNetwork]?: T;
};

export interface PairInfoConfig {
    pair: IPool.PairStruct;
    tradingConfig: IPool.TradingConfigStruct;
    tradingFeeConfig: IPool.TradingFeeConfigStruct;
    fundingFeeConfig: IFundingRate.FundingFeeConfigStruct;
}

export interface ReserveConfiguration {
    MarketTokenSymbol: string;
    MarketTokenName: string;
    MarketTokenAddress: ParamsPerNetwork<string>;
    WrapperTokenAddress: ParamsPerNetwork<string>;
    PairsConfig: SymbolMap<PairInfoConfig>;
    PairAssets: ParamsPerNetwork<SymbolMap<string>>;
    ExecuteOrderTimeDelay: number;
    OraclePriceFeedAddress: ParamsPerNetwork<string>;
    UniswapRouterAddress: ParamsPerNetwork<string>;
    UniswapTokenPathConfig: ParamsPerNetwork<SymbolMap<string>>;
}
