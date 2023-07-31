import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    IndexPriceFeed,
    MockPriceFeed,
    OraclePriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    RoleManager,
    Token,
    WETH,
} from '../types';
import { getContract } from './utilities/tx';
import {
    ADDRESSES_PROVIDER_ID,
    INDEX_PRICE_FEED_ID,
    MOCK_PRICE_FEED_PREFIX,
    ORACLE_PRICE_FEED_ID,
    PAIR_INFO_ID,
    PAIR_LIQUIDITY_ID,
    PAIR_VAULT_ID,
    ROLE_MANAGER_ID,
    TOKEN_PREFIX,
} from './deploy-ids';
import { MARKET_NAME } from './env';

declare var hre: HardhatRuntimeEnvironment;

export const getMockToken = async (pair: string, address?: string): Promise<Token> => {
    return getContract<Token>('Token', address || (await hre.deployments.get(TOKEN_PREFIX + pair)).address);
};

export const getToken = async (address?: string): Promise<Token> => {
    return getContract<Token>('Token', address || (await hre.deployments.get(MARKET_NAME)).address);
};

export const getWETH = async (address?: string): Promise<WETH> => {
    return getContract<WETH>('WETH', address || (await hre.deployments.get('WETH')).address);
};

export const getMockPriceFeed = async (pair: string, address?: string): Promise<MockPriceFeed> => {
    return getContract<MockPriceFeed>(
        'MockPriceFeed',
        address || (await hre.deployments.get(MOCK_PRICE_FEED_PREFIX + pair)).address,
    );
};

export const getAddressesProvider = async (address?: string): Promise<AddressesProvider> => {
    return getContract<AddressesProvider>(
        'AddressesProvider',
        address || (await hre.deployments.get(ADDRESSES_PROVIDER_ID)).address,
    );
};

export const getRoleManager = async (address?: string): Promise<RoleManager> => {
    return getContract<RoleManager>('RoleManager', address || (await hre.deployments.get(ROLE_MANAGER_ID)).address);
};

export const getOraclePriceFeed = async (address?: string): Promise<OraclePriceFeed> => {
    return getContract<OraclePriceFeed>(
        'OraclePriceFeed',
        address || (await hre.deployments.get(ORACLE_PRICE_FEED_ID)).address,
    );
};

export const getIndexPriceFeed = async (address?: string): Promise<IndexPriceFeed> => {
    return getContract<IndexPriceFeed>(
        'IndexPriceFeed',
        address || (await hre.deployments.get(INDEX_PRICE_FEED_ID)).address,
    );
};

export const getPairInfo = async (address?: string): Promise<PairInfo> => {
    return getContract<PairInfo>('PairInfo', address || (await hre.deployments.get(PAIR_INFO_ID)).address);
};

export const getPairVault = async (address?: string): Promise<PairVault> => {
    return getContract<PairVault>('PairVault', address || (await hre.deployments.get(PAIR_VAULT_ID)).address);
};

export const getPairLiquidity = async (address?: string): Promise<PairLiquidity> => {
    return getContract<PairLiquidity>(
        'PairLiquidity',
        address || (await hre.deployments.get(PAIR_LIQUIDITY_ID)).address,
    );
};
