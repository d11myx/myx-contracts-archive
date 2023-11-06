import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, ethers } from 'ethers';

export const ONE_ETHER = ethers.utils.parseEther('1');
export const MAX_UINT_AMOUNT = ethers.constants.MaxUint256;
export const ZERO_ADDRESS = ethers.constants.AddressZero;
export const PRICE_PRECISION = '1000000000000000000000000000000';
export const PERCENTAGE = '100000000';

export enum DevNetwork {
    local = 'dev_local',
}

export enum EthereumNetwork {
    main = 'ethereum_mainnet',
    goerli = 'ethereum_goerli',
}

export enum LineaNetwork {
    main = 'linea_mainnet',
    goerli = 'linea_goerli',
}

export enum ScrollNetwork {
    main = 'scroll_mainnet',
    sepolia = 'scroll_sepolia',
}

export enum TradeType {
    MARKET = 0,
    LIMIT = 1,
    TP = 2,
    SL = 3,
}

export type eNetwork = DevNetwork | EthereumNetwork | LineaNetwork | ScrollNetwork;

export const MOCK_PRICES: { [key: string]: BigNumber } = {
    USDT: parseUnits('1', 8),
    BTC: parseUnits('30000', 8),
    ETH: parseUnits('2000', 8),
};
export const MOCK_INDEX_PRICES: { [key: string]: BigNumber } = {
    USDT: parseUnits('1', 30),
    BTC: parseUnits('30000', 30),
    ETH: parseUnits('2000', 30),
};

export const DEFAULT_NAMED_ACCOUNTS = {
    deployer: {
        default: 0,
    },
    poolAdmin: {
        default: 0,
    },
    operator: {
        default: 1,
    },
    treasurer: {
        default: 1,
    },
    keeper: {
        default: 0,
    },
    dao: {
        default: 0,
    },
    feeReceiver: {
        default: 0,
    },
    slipReceiver: {
        default: 0,
    },
    teamAndAdvisor: {
        default: 2,
    },
    privatePlacement: {
        default: 2,
    },
    community: {
        default: 2,
    },
    initLiquidity: {
        default: 2,
    },
    marketOperation: {
        default: 2,
    },
    ecoKeeper: {
        default: 2,
    },
    developmentReserve: {
        default: 2,
    },
    trader: {
        default: 10,
    },
    lpUser: {
        default: 10,
    },
};
