import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import {
    AddressesProvider,
    IndexPriceFeed,
    Pool,
    RoleManager,
    MockERC20Token,
    PositionManager,
    WETH9,
    Router,
    Executor,
    OrderManager,
    FundingRate,
    ExecutionLogic,
    RiskReserve,
    LiquidationLogic,
    FeeCollector,
    Timelock,
    SpotSwap,
    MockPythOraclePriceFeed,
    PoolView,
} from '../../types';
import {
    SymbolMap,
    getAddressesProvider,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getPool,
    getFundingRate,
    getToken,
    getWETH,
    MOCK_TOKEN_PREFIX,
    initPairs,
    deployTrading,
    deployPair,
    deployPrice,
    deployToken,
    deployContract,
    getRouter,
    getExecutor,
    getOrderManager,
    getPositionManager,
    deployLibraries,
    getRoleManager,
    getExecutionLogic,
    getRiskReserve,
    getLiquidationLogic,
    getFeeCollector,
    getSpotSwap,
    getMockToken,
    getPoolView,
} from '../../helpers';

declare var hre: HardhatRuntimeEnvironment;

export interface SignerWithAddress {
    signer: Signer;
    address: string;
}

export interface TestEnv {
    deployer: SignerWithAddress;
    poolAdmin: SignerWithAddress;
    keeper: SignerWithAddress;
    users: SignerWithAddress[];
    weth: WETH9;
    btc: MockERC20Token;
    eth: MockERC20Token;
    usdt: MockERC20Token;
    addressesProvider: AddressesProvider;
    roleManager: RoleManager;
    pairTokens: SymbolMap<MockERC20Token>;
    pool: Pool;
    poolView: PoolView;
    spotSwap: SpotSwap;
    fundingRate: FundingRate;
    oraclePriceFeed: MockPythOraclePriceFeed;
    indexPriceFeed: IndexPriceFeed;
    router: Router;
    executionLogic: ExecutionLogic;
    liquidationLogic: LiquidationLogic;
    executor: Executor;
    orderManager: OrderManager;
    positionManager: PositionManager;
    riskReserve: RiskReserve;
    feeCollector: FeeCollector;
}

export const testEnv: TestEnv = {
    deployer: {} as SignerWithAddress,
    poolAdmin: {} as SignerWithAddress,
    keeper: {} as SignerWithAddress,
    users: [] as SignerWithAddress[],
    weth: {} as WETH9,
    btc: {} as MockERC20Token,
    eth: {} as MockERC20Token,
    usdt: {} as MockERC20Token,
    addressesProvider: {} as AddressesProvider,
    roleManager: {} as RoleManager,
    pairTokens: {} as SymbolMap<MockERC20Token>,
    pool: {} as Pool,
    poolView: {} as PoolView,
    spotSwap: {} as SpotSwap,
    fundingRate: {} as FundingRate,
    oraclePriceFeed: {} as MockPythOraclePriceFeed,
    indexPriceFeed: {} as IndexPriceFeed,
    router: {} as Router,
    executionLogic: {} as ExecutionLogic,
    liquidationLogic: {} as LiquidationLogic,
    executor: {} as Executor,
    orderManager: {} as OrderManager,
    positionManager: {} as PositionManager,
    riskReserve: {} as RiskReserve,
    feeCollector: {} as FeeCollector,
} as TestEnv;

export async function setupTestEnv() {
    const [_deployer, , ...restSigners] = await getSigners(hre);
    const deployer: SignerWithAddress = {
        address: await _deployer.getAddress(),
        signer: _deployer,
    };

    for (const signer of restSigners) {
        testEnv.users.push({
            signer,
            address: await signer.getAddress(),
        });
    }

    // users
    testEnv.deployer = deployer;
    testEnv.poolAdmin = deployer;
    testEnv.keeper = deployer;

    const allDeployments = await hre.deployments.all();
    const mockTokenKeys = Object.keys(allDeployments).filter((key) => key.includes(MOCK_TOKEN_PREFIX));

    let pairTokens: SymbolMap<MockERC20Token> = {};
    for (let [key, deployment] of Object.entries(allDeployments)) {
        if (mockTokenKeys.includes(key)) {
            pairTokens[key.replace(MOCK_TOKEN_PREFIX, '')] = await getToken(deployment.address);
        }
    }

    // tokens
    testEnv.weth = await getWETH();
    testEnv.usdt = await getToken();
    testEnv.pairTokens = pairTokens;
    testEnv.btc = pairTokens['WBTC'];
    testEnv.eth = pairTokens['WETH'] || (await getMockToken('', (await getWETH()).address));

    // provider
    testEnv.addressesProvider = await getAddressesProvider();
    testEnv.roleManager = await getRoleManager();

    // oracle
    testEnv.oraclePriceFeed = await getOraclePriceFeed();
    testEnv.indexPriceFeed = await getIndexPriceFeed();

    // pair
    testEnv.pool = await getPool();
    testEnv.poolView = await getPoolView();
    testEnv.spotSwap = await getSpotSwap();

    testEnv.fundingRate = await getFundingRate();

    // trading
    testEnv.router = await getRouter();
    testEnv.executionLogic = await getExecutionLogic();
    testEnv.liquidationLogic = await getLiquidationLogic();
    testEnv.executor = await getExecutor();
    testEnv.orderManager = await getOrderManager();
    testEnv.positionManager = await getPositionManager();
    testEnv.riskReserve = await getRiskReserve();
    testEnv.feeCollector = await getFeeCollector();
}

export async function newTestEnv(): Promise<TestEnv> {
    const [_deployer, _keeper, ...restSigners] = await getSigners(hre);
    const deployer: SignerWithAddress = {
        address: await _deployer.getAddress(),
        signer: _deployer,
    };
    const keeper: SignerWithAddress = {
        address: await _keeper.getAddress(),
        signer: _keeper,
    };

    const users: SignerWithAddress[] = [];
    for (const signer of restSigners) {
        users.push({
            signer,
            address: await signer.getAddress(),
        });
    }

    const { validationHelper } = await deployLibraries();

    const { weth, usdt, tokens } = await deployToken();

    const timelock = (await deployContract('Timelock', ['3600'])) as Timelock;
    const addressesProvider = (await deployContract('AddressesProvider', [
        weth.address,
        timelock.address,
    ])) as AddressesProvider;
    const roleManager = (await deployContract('RoleManager', [])) as RoleManager;

    await addressesProvider.setRolManager(roleManager.address);

    await roleManager.addPoolAdmin(deployer.address);
    await roleManager.addKeeper(keeper.address);

    const { oraclePriceFeed, indexPriceFeed, fundingRate } = await deployPrice(
        deployer,
        keeper,
        timelock,
        addressesProvider,
        tokens,
    );

    const { pool, poolView, spotSwap } = await deployPair(addressesProvider, oraclePriceFeed, deployer, weth);

    const {
        positionManager,
        router,
        executionLogic,
        liquidationLogic,
        executor,
        orderManager,
        riskReserve,
        feeCollector,
    } = await deployTrading(deployer, deployer, addressesProvider, roleManager, pool, usdt, validationHelper);

    await indexPriceFeed.updateExecutorAddress(executor.address);

    await addressesProvider
        .connect(deployer.signer)
        .initialize(
            oraclePriceFeed.address,
            indexPriceFeed.address,
            fundingRate.address,
            executionLogic.address,
            liquidationLogic.address,
        );
    await pool.setRouter(router.address);
    await pool.setPoolView(poolView.address);
    await pool.setPositionManager(positionManager.address);
    await pool.setOrderManager(orderManager.address);
    await poolView.setPool(pool.address);
    await poolView.setPositionManager(positionManager.address);
    await initPairs(deployer, tokens, usdt, pool, fundingRate, feeCollector);

    await roleManager.addKeeper(executor.address);
    return {
        deployer: deployer,
        poolAdmin: deployer,
        keeper: keeper,
        users: users,
        weth: weth,
        btc: tokens['WBTC'],
        eth: tokens['WETH'],
        usdt: usdt,
        addressesProvider: addressesProvider,
        roleManager: roleManager,
        pairTokens: tokens,
        pool: pool,
        poolView: poolView,
        spotSwap: spotSwap,
        fundingRate: fundingRate,
        oraclePriceFeed: oraclePriceFeed,
        indexPriceFeed: indexPriceFeed,
        positionManager: positionManager,
        router: router,
        executionLogic: executionLogic,
        liquidationLogic: liquidationLogic,
        executor: executor,
        orderManager: orderManager,
        riskReserve: riskReserve,
        feeCollector: feeCollector,
    } as TestEnv;
}
