import { ConfigNames } from './market-config-helper';

export let { MARKET_NAME }: { MARKET_NAME: ConfigNames } = process.env as any;

MARKET_NAME = MARKET_NAME ? MARKET_NAME : ConfigNames.USDT;

export const COMMON_DEPLOY_PARAMS = {
    log: true,
    skipIfAlreadyDeployed: true,
};
