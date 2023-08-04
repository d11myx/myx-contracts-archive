import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    ExecuteRouter,
    Executor,
    IndexPriceFeed,
    MockPriceFeed,
    OraclePriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    OrderManager,
    RoleManager,
    Router,
    Token,
    TradingRouter,
    TradingVault,
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
    MOCK_TOKEN_PREFIX,
    TRADING_VAULT_ID,
    TRADING_ROUTER_ID,
    EXECUTE_ROUTER_ID,
    ROUTER_ID,
    EXECUTOR_ID,
    ORDER_MANAGER_ID,
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

export const getTradingVault = async (address?: string): Promise<TradingVault> => {
    return getContract<TradingVault>('TradingVault', address || (await hre.deployments.get(TRADING_VAULT_ID)).address);
};

export const getTradingRouter = async (address?: string): Promise<TradingRouter> => {
    return getContract<TradingRouter>(
        'TradingRouter',
        address || (await hre.deployments.get(TRADING_ROUTER_ID)).address,
    );
};

export const getExecuteRouter = async (address?: string): Promise<ExecuteRouter> => {
    return getContract<ExecuteRouter>(
        'ExecuteRouter',
        address || (await hre.deployments.get(EXECUTE_ROUTER_ID)).address,
    );
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
