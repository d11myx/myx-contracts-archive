import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    Executor,
    IndexPriceFeed,
    MockPriceFeed,
    OraclePriceFeed,
    Pool,
    OrderManager,
    RoleManager,
    Router,
    Token,
    PositionManager,
    WETH,
} from '../types';
import { getContract } from './utilities/tx';
import {
    ADDRESSES_PROVIDER_ID,
    INDEX_PRICE_FEED_ID,
    MOCK_PRICE_FEED_PREFIX,
    ORACLE_PRICE_FEED_ID,
    PAIR_INFO_ID,
    ROLE_MANAGER_ID,
    MOCK_TOKEN_PREFIX,
    TRADING_VAULT_ID,
    ROUTER_ID,
    EXECUTOR_ID,
    ORDER_MANAGER_ID,
    POSITION_MANAGER_ID,
} from './deploy-ids';
import { MARKET_NAME } from './env';

declare var hre: HardhatRuntimeEnvironment;

export const getMockToken = async (pair: string, address?: string): Promise<Token> => {
    return getContract<Token>('Token', address || (await hre.deployments.get(MOCK_TOKEN_PREFIX + pair)).address);
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

export const getPool = async (address?: string): Promise<Pool> => {
    return getContract<Pool>('Pool', address || (await hre.deployments.get(PAIR_INFO_ID)).address);
};

export const getRouter = async (address?: string): Promise<Router> => {
    return getContract<Router>('Router', address || (await hre.deployments.get(ROUTER_ID)).address);
};

export const getExecutor = async (address?: string): Promise<Executor> => {
    return getContract<Executor>('Executor', address || (await hre.deployments.get(EXECUTOR_ID)).address);
};

export const getOrderManager = async (address?: string): Promise<OrderManager> => {
    return getContract<OrderManager>('OrderManager', address || (await hre.deployments.get(ORDER_MANAGER_ID)).address);
};

export const getPositionManager = async (address?: string): Promise<PositionManager> => {
    return getContract<PositionManager>(
        'PositionManager',
        address || (await hre.deployments.get(POSITION_MANAGER_ID)).address,
    );
};
