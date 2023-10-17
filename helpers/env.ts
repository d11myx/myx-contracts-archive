import { ConfigNames } from './market-config-helper';
import * as dotenv from 'dotenv';
dotenv.config();

export let { MARKET_NAME }: { MARKET_NAME: ConfigNames } = process.env as any;
MARKET_NAME = MARKET_NAME ? MARKET_NAME : ConfigNames.USDT;

export const COMMON_DEPLOY_PARAMS = {
    log: true,
    skipIfAlreadyDeployed: true,
    waitConfirmations: 1,
    autoMine: true,
};
