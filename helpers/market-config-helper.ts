import { ReserveConfiguration } from './types';
import USDCMarketConfig from '../markets/usdc';

export enum ConfigNames {
    USDC = 'USDC',
}

export function loadReserveConfig(configName: ConfigNames): ReserveConfiguration {
    switch (configName) {
        case ConfigNames.USDC:
            return USDCMarketConfig;
        default:
            throw new Error(
                `Unsupported reserve configuration: ${configName} is not one of the supported configs ${Object.values(
                    ConfigNames,
                )}`,
            );
    }
}
