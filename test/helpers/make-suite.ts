import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import {
    AddressesProvider,
    IndexPriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    RoleManager,
    Token,
    TradingVault,
    OraclePriceFeed,
    WETH,
    Router,
    Executor,
    OrderManager,
    PositionManager,
} from '../../types';
import {
    SymbolMap,
    getAddressesProvider,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getPairInfo,
    getPairLiquidity,
    getPairVault,
    getRoleManager,
    getToken,
    getTradingVault,
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
} from '../../helpers';
import { address } from 'hardhat/internal/core/config/config-validation';

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
    weth: WETH;
    btc: Token;
    eth: Token;
    usdt: Token;
    addressesProvider: AddressesProvider;
    roleManager: RoleManager;
    pairTokens: SymbolMap<Token>;
    pairInfo: PairInfo;
    pairLiquidity: PairLiquidity;
    pairVault: PairVault;
    oraclePriceFeed: OraclePriceFeed;
    indexPriceFeed: IndexPriceFeed;
    tradingVault: TradingVault;
    router: Router;
    executor: Executor;
    orderManager: OrderManager;
    positionManager: PositionManager;
}

export const testEnv: TestEnv = {
    deployer: {} as SignerWithAddress,
    poolAdmin: {} as SignerWithAddress,
    keeper: {} as SignerWithAddress,
    users: [] as SignerWithAddress[],
    weth: {} as WETH,
    btc: {} as Token,
    eth: {} as Token,
    usdt: {} as Token,
    addressesProvider: {} as AddressesProvider,
    roleManager: {} as RoleManager,
    pairTokens: {} as SymbolMap<Token>,
    pairInfo: {} as PairInfo,
    pairLiquidity: {} as PairLiquidity,
    pairVault: {} as PairVault,
    oraclePriceFeed: {} as OraclePriceFeed,
    indexPriceFeed: {} as IndexPriceFeed,
    tradingVault: {} as TradingVault,
    router: {} as Router,
    executor: {} as Executor,
    orderManager: {} as OrderManager,
    positionManager: {} as PositionManager,
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

    let pairTokens: SymbolMap<Token> = {};
    for (let [key, deployment] of Object.entries(allDeployments)) {
        if (mockTokenKeys.includes(key)) {
            pairTokens[key.replace(MOCK_TOKEN_PREFIX, '')] = await getToken(deployment.address);
        }
    }

    // tokens
    testEnv.weth = await getWETH();
    testEnv.usdt = await getToken();
    testEnv.pairTokens = pairTokens;
    testEnv.btc = pairTokens['BTC'];
    testEnv.eth = pairTokens['ETH'];

    // provider
    testEnv.addressesProvider = await getAddressesProvider();
    testEnv.roleManager = await getRoleManager();

    // oracle
    testEnv.oraclePriceFeed = await getOraclePriceFeed();
    testEnv.indexPriceFeed = await getIndexPriceFeed();

    // pair
    testEnv.pairInfo = await getPairInfo();
    testEnv.pairLiquidity = await getPairLiquidity();
    testEnv.pairVault = await getPairVault();

    // trading
    testEnv.tradingVault = await getTradingVault();
    testEnv.router = await getRouter();
    testEnv.executor = await getExecutor();
    testEnv.orderManager = await getOrderManager();
    testEnv.positionManager = await getPositionManager();
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
    const { weth, usdt, tokens } = await deployToken();

    const addressesProvider = (await deployContract('AddressesProvider', [])) as AddressesProvider;
    const roleManager = (await deployContract('RoleManager', [addressesProvider.address])) as RoleManager;
    await addressesProvider.setRolManager(roleManager.address);
    await roleManager.addPoolAdmin(deployer.address);
    await roleManager.addKeeper(keeper.address);

    const { vaultPriceFeed, fastPriceFeed } = await deployPrice(deployer, keeper, addressesProvider, tokens);

    const { pairInfo, pairLiquidity, pairVault } = await deployPair(addressesProvider, vaultPriceFeed, deployer, weth);

    const { tradingVault, router, executor, orderManager, positionManager } = await deployTrading(
        deployer,
        deployer,
        addressesProvider,
        roleManager,
        pairVault,
        pairInfo,
        vaultPriceFeed,
        fastPriceFeed,
    );

    await initPairs(deployer, tokens, usdt, pairInfo, pairLiquidity);

    await roleManager.addKeeper(executor.address);
    return {
        deployer: deployer,
        poolAdmin: deployer,
        keeper: keeper,
        users: users,
        weth: weth,
        btc: tokens['BTC'],
        eth: tokens['ETH'],
        usdt: usdt,
        addressesProvider: addressesProvider,
        roleManager: roleManager,
        pairTokens: tokens,
        pairInfo: pairInfo,
        pairLiquidity: pairLiquidity,
        pairVault: pairVault,
        oraclePriceFeed: vaultPriceFeed,
        indexPriceFeed: fastPriceFeed,
        tradingVault: tradingVault,
        router: router,
        executor: executor,
        orderManager: orderManager,
        positionManager: positionManager,
    } as TestEnv;
}
