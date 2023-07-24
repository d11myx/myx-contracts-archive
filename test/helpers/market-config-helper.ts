import MarketConfig from '../config';
import { PairInfoConfig, ReserveConfiguration } from '../shared/types';

export function loadReserveConfig(market: string): ReserveConfiguration {
  return MarketConfig[market];
}

export function loadPairConfig(market: string, asset: string): PairInfoConfig {
  return loadReserveConfig(market)?.PairsConfig[asset];
}
