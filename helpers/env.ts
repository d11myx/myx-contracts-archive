import { ConfigNames } from './market-config-helper';
import * as dotenv from 'dotenv';
import { DevNetwork, eNetwork } from './constants';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

export let { MARKET_NAME }: { MARKET_NAME: ConfigNames } = process.env as any;
MARKET_NAME = MARKET_NAME ? MARKET_NAME : ConfigNames.USDC;

export const COMMON_DEPLOY_PARAMS = {
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
    waitConfirmations: 1,
};

export function isLocalNetwork(hre: HardhatRuntimeEnvironment) {
    const network = hre.network.name as eNetwork;

    return (!hre.network.live && network == DevNetwork.local) || network.toString() == 'hardhat';
}

export function isProdNetwork(hre: HardhatRuntimeEnvironment) {
    return hre.network.live;
}

export function isTestNetwork(hre: HardhatRuntimeEnvironment) {
    return !isProdNetwork(hre) && !isLocalNetwork(hre);
}
