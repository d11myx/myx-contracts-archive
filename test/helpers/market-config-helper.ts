import MarketConfig from '../config';
import { PairInfoConfig, ReserveConfiguration, SymbolMap } from '../shared/types';
import { getMarketSymbol } from '../shared/constants';

export function loadCurrentReserveConfig(): ReserveConfiguration {
    return MarketConfig[getMarketSymbol()];
}

export function loadReserveConfig(market: string): ReserveConfiguration {
    return MarketConfig[market];
}

export function loadCurrentPairConfigs(): SymbolMap<PairInfoConfig> {
    return loadReserveConfig(getMarketSymbol())?.PairsConfig;
}

export function loadPairConfigs(market: string): SymbolMap<PairInfoConfig> {
    return loadReserveConfig(market)?.PairsConfig;
}
