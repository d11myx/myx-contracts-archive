import { IPool } from '../types';
import { eNetwork } from './constants';
import type {
    BaseContract,
    BigNumber,
    BigNumberish,
    BytesLike,
    CallOverrides,
    ContractTransaction,
    Overrides,
    PopulatedTransaction,
    Signer,
    utils,
} from 'ethers';
import type { FunctionFragment, Result, EventFragment } from '@ethersproject/abi';
import type { Listener, Provider } from '@ethersproject/providers';
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from '../types/common';

export interface SymbolMap<T> {
    [symbol: string]: T;
}

export type ParamsPerNetwork<T> = {
    [k in eNetwork]?: T;
};

export type FundingFeeConfigStruct = {
    minFundingRate: PromiseOrValue<BigNumberish>;
    maxFundingRate: PromiseOrValue<BigNumberish>;
    fundingWeightFactor: PromiseOrValue<BigNumberish>;
    liquidityPremiumFactor: PromiseOrValue<BigNumberish>;
    interest: PromiseOrValue<BigNumberish>;
    fundingInterval: PromiseOrValue<BigNumberish>;
};

export interface PairInfoConfig {
    pair: IPool.PairStruct;
    tradingConfig: IPool.TradingConfigStruct;
    tradingFeeConfig: IPool.TradingFeeConfigStruct;
    fundingFeeConfig: FundingFeeConfigStruct;
}

export interface ReserveConfiguration {
    TokenSymbol: string;
    TokenName: string;
    TokenAddress: ParamsPerNetwork<string>;
    PairsConfig: SymbolMap<PairInfoConfig>;
    PairAssets: ParamsPerNetwork<SymbolMap<string>>;
}
