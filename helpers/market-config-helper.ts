import { ReserveConfiguration } from './types';
import USDTMarketConfig from '../markets/usdt';

export enum ConfigNames {
    USDT = 'USDT',
}

export function loadReserveConfig(configName: ConfigNames): ReserveConfiguration {
    switch (configName) {
        case ConfigNames.USDT:
            return USDTMarketConfig;
        default:
            throw new Error(
                `Unsupported reserve configuration: ${configName} is not one of the supported configs ${Object.values(
                    ConfigNames,
                )}`,
            );
    }
}
