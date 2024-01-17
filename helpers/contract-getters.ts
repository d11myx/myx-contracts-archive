import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    Executor,
    IndexPriceFeed,
    Pool,
    OrderManager,
    RoleManager,
    Router,
    PositionManager,
    WETH9,
    PoolTokenFactory,
    FundingRate,
    ExecutionLogic,
    RiskReserve,
    LiquidationLogic,
    FeeCollector,
    Timelock,
    MockERC20Token,
    SpotSwap,
    MockPythOraclePriceFeed,
    PoolToken,
    PoolView,
    UiPoolDataProvider,
    UiPositionDataProvider,
    Backtracker,
} from '../types';
import { getContract } from './utilities/tx';
import {
    ADDRESSES_PROVIDER_ID,
    INDEX_PRICE_FEED_ID,
    ORACLE_PRICE_FEED_ID,
    PAIR_INFO_ID,
    ROLE_MANAGER_ID,
    MOCK_TOKEN_PREFIX,
    ROUTER_ID,
    EXECUTOR_ID,
    ORDER_MANAGER_ID,
    POSITION_MANAGER_ID,
    POOL_TOKEN_FACTORY,
    FUNDING_RATE,
    EXECUTION_LOGIC_ID,
    RISK_RESERVE_ID,
    LIQUIDATION_LOGIC_ID,
    FEE_COLLECTOR_ID,
    TIMELOCK_ID,
    SPOT_SWAP,
    POOL_VIEW_ID,
    BACKTRACKER_ID,
} from './deploy-ids';
import { MARKET_NAME } from './env';
import { SymbolMap } from './types';

declare var hre: HardhatRuntimeEnvironment;

export const getMockToken = async (pair: string, address?: string): Promise<MockERC20Token> => {
    return getContract<MockERC20Token>(
        'MockERC20Token',
        address || (await hre.deployments.get(MOCK_TOKEN_PREFIX + pair)).address,
    );
};

export const getToken = async (address?: string): Promise<MockERC20Token> => {
    return getContract<MockERC20Token>('MockERC20Token', address || (await hre.deployments.get(MARKET_NAME)).address);
};

export const getWETH = async (address?: string): Promise<WETH9> => {
    return getContract<WETH9>('WETH9', address || (await hre.deployments.get('WETH')).address);
};

export const getTimelock = async (address?: string): Promise<Timelock> => {
    return getContract<Timelock>('Timelock', address || (await hre.deployments.get(TIMELOCK_ID)).address);
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

export const getOraclePriceFeed = async (address?: string): Promise<MockPythOraclePriceFeed> => {
    return getContract<MockPythOraclePriceFeed>(
        'MockPythOraclePriceFeed',
        address || (await hre.deployments.get(ORACLE_PRICE_FEED_ID)).address,
    );
};

export const getIndexPriceFeed = async (address?: string): Promise<IndexPriceFeed> => {
    return getContract<IndexPriceFeed>(
        'IndexPriceFeed',
        address || (await hre.deployments.get(INDEX_PRICE_FEED_ID)).address,
    );
};

export const getPoolTokenFactory = async (address?: string): Promise<PoolTokenFactory> => {
    return getContract<PoolTokenFactory>(
        'PoolTokenFactory',
        address || (await hre.deployments.get(POOL_TOKEN_FACTORY)).address,
    );
};

export const getPoolToken = async (address: string): Promise<PoolToken> => {
    return getContract<PoolToken>('PoolToken', address);
};

export const getPool = async (address?: string): Promise<Pool> => {
    return getContract<Pool>('Pool', address || (await hre.deployments.get(PAIR_INFO_ID)).address);
};

export const getPoolView = async (address?: string): Promise<PoolView> => {
    return getContract<PoolView>('PoolView', address || (await hre.deployments.get(POOL_VIEW_ID)).address);
};

export const getSpotSwap = async (address?: string): Promise<SpotSwap> => {
    return getContract<SpotSwap>('SpotSwap', address || (await hre.deployments.get(SPOT_SWAP)).address);
};
export const getFundingRate = async (address?: string): Promise<FundingRate> => {
    return getContract<FundingRate>('FundingRate', address || (await hre.deployments.get(FUNDING_RATE)).address);
};

export const getRouter = async (address?: string): Promise<Router> => {
    return getContract<Router>('Router', address || (await hre.deployments.get(ROUTER_ID)).address);
};

export const getExecutor = async (address?: string): Promise<Executor> => {
    return getContract<Executor>('Executor', address || (await hre.deployments.get(EXECUTOR_ID)).address);
};

export const getBacktracker = async (address?: string): Promise<Backtracker> => {
    return getContract<Backtracker>('Backtracker', address || (await hre.deployments.get(BACKTRACKER_ID)).address);
};

export const getExecutionLogic = async (address?: string): Promise<ExecutionLogic> => {
    return getContract<ExecutionLogic>(
        'ExecutionLogic',
        address || (await hre.deployments.get(EXECUTION_LOGIC_ID)).address,
    );
};

export const getLiquidationLogic = async (address?: string): Promise<LiquidationLogic> => {
    return getContract<LiquidationLogic>(
        'LiquidationLogic',
        address || (await hre.deployments.get(LIQUIDATION_LOGIC_ID)).address,
    );
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

export const getRiskReserve = async (address?: string): Promise<RiskReserve> => {
    return getContract<RiskReserve>('RiskReserve', address || (await hre.deployments.get(RISK_RESERVE_ID)).address);
};

export const getFeeCollector = async (address?: string): Promise<FeeCollector> => {
    return getContract<FeeCollector>('FeeCollector', address || (await hre.deployments.get(FEE_COLLECTOR_ID)).address);
};

export const getUiPoolDataProvider = async (address?: string): Promise<UiPoolDataProvider> => {
    return getContract<UiPoolDataProvider>(
        'UiPoolDataProvider',
        address || (await hre.deployments.get('UiPositionDataProvider')).address,
    );
};

export const getUiPositionDataProvider = async (address?: string): Promise<UiPositionDataProvider> => {
    return getContract<UiPositionDataProvider>(
        'UiPositionDataProvider',
        address || (await hre.deployments.get('UiPositionDataProvider')).address,
    );
};

export async function getTokens() {
    const allDeployments = await hre.deployments.all();
    const mockTokenKeys = Object.keys(allDeployments).filter((key) => key.includes(MOCK_TOKEN_PREFIX));

    let pairTokens: SymbolMap<MockERC20Token> = {};
    for (let [key, deployment] of Object.entries(allDeployments)) {
        if (mockTokenKeys.includes(key)) {
            pairTokens[key.replace(MOCK_TOKEN_PREFIX, '')] = await getToken(deployment.address);
        }
    }
    // tokens
    const usdt = await getToken();
    const btc = pairTokens['WBTC'];
    let eth = pairTokens['WETH'];
    if (!eth) {
        eth = await getMockToken('', (await getWETH()).address);
    }
    return { usdt, btc, eth };
}
