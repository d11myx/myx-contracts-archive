import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    Executor,
    FeeCollector,
    IndexPriceFeed,
    MockPriceFeed,
    OraclePriceFeed,
    OrderManager,
    Pool,
    PoolTokenFactory,
    PositionManager,
    RoleManager,
    Router,
    TestCallBack,
    Token,
    WETH,
} from '../types';
import { Contract, ethers } from 'ethers';
import { MARKET_NAME } from './env';
import { deployContract, getBlockTimestamp, waitForTx } from './utilities/tx';
import { MOCK_PRICES } from './constants';
import { SymbolMap } from './types';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { loadReserveConfig } from './market-config-helper';
import { getToken, getWETH } from './contract-getters';

declare var hre: HardhatRuntimeEnvironment;

export const deployMockToken = async (symbol: string): Promise<Token> => {
    return await deployContract<Token>('Token', [symbol]);
};

export const deployWETH = async (): Promise<WETH> => {
    return await deployContract<WETH>('WETH', ['WETH', 'WETH', '18']);
};

export async function deployLibraries() {
    console.log(` - setup libraries`);

    const validationHelper = await deployContract('ValidationHelper', []);
    console.log(`deployed ValidationHelper at ${validationHelper.address}`);

    return {
        validationHelper,
    };
}

export async function deployToken() {
    console.log(` - setup tokens`);

    // basic token
    const usdt = await deployMockToken(MARKET_NAME);
    console.log(`deployed USDT at ${usdt.address}`);

    const weth = await deployWETH();
    console.log(`deployed WETH at ${weth.address}`);

    // pairs token
    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const tokens: SymbolMap<Token> = {};
    for (let pair of Object.keys(pairConfigs)) {
        const token = await deployMockToken(pair);
        console.log(`deployed ${pair} at ${token.address}`);

        tokens[pair] = token;
    }
    return { usdt, weth, tokens };
}

export async function deployPrice(
    deployer: SignerWithAddress,
    keeper: SignerWithAddress,
    addressesProvider: AddressesProvider,
    tokens: SymbolMap<Token>,
) {
    console.log(` - setup price`);

    const oraclePriceFeed = (await deployContract('OraclePriceFeed', [
        addressesProvider.address,
    ])) as any as OraclePriceFeed;
    console.log(`deployed OraclePriceFeed at ${oraclePriceFeed.address}`);

    const pairTokenAddresses = [];
    const pairTokenPrices = [];
    for (let [pair, token] of Object.entries(tokens)) {
        const priceFeed = (await deployContract('MockPriceFeed', [])) as any as MockPriceFeed;
        console.log(`deployed MockPriceFeed with ${pair} at ${priceFeed.address}`);

        await priceFeed.connect(deployer.signer).setAdmin(keeper.address, true);
        await priceFeed.connect(keeper.signer).setLatestAnswer(MOCK_PRICES[pair]);

        const pairTokenAddress = token.address;
        if (!pairTokenAddress) {
            throw `wait for deployed before using`;
        }
        await oraclePriceFeed.setTokenConfig(pairTokenAddress, priceFeed.address, 8);

        pairTokenAddresses.push(pairTokenAddress);
        pairTokenPrices.push(
            ethers.utils.parseUnits(ethers.utils.formatUnits(MOCK_PRICES[pair].toString(), 8).toString(), 30),
        );
    }

    const indexPriceFeed = (await deployContract('IndexPriceFeed', [
        addressesProvider.address,
    ])) as any as IndexPriceFeed;
    console.log(`deployed IndexPriceFeed at ${indexPriceFeed.address}`);

    await indexPriceFeed.connect(deployer.signer).setTokens(pairTokenAddresses, [10, 10]);

    await indexPriceFeed.connect(deployer.signer).setMaxTimeDeviation(10000);

    await indexPriceFeed
        .connect(keeper.signer)
        .setPrices(pairTokenAddresses, pairTokenPrices, (await getBlockTimestamp()) + 100);

    await oraclePriceFeed.setIndexPriceFeed(indexPriceFeed.address);

    await addressesProvider.connect(deployer.signer).setPriceOracle(oraclePriceFeed.address);
    await addressesProvider.connect(deployer.signer).setIndexPriceOracle(indexPriceFeed.address);
    return { oraclePriceFeed, indexPriceFeed };
}

export async function deployPair(
    addressProvider: AddressesProvider,
    vaultPriceFeed: OraclePriceFeed,
    deployer: SignerWithAddress,
    weth: WETH,
) {
    console.log(` - setup pairs`);
    const poolTokenFactory = (await deployContract('PoolTokenFactory', [addressProvider.address])) as PoolTokenFactory;
    const pool = (await deployContract('Pool', [addressProvider.address, poolTokenFactory.address])) as any as Pool;
    console.log(`deployed Pool at ${pool.address}`);

    return { poolTokenFactory, pool };
}

export async function deployTrading(
    deployer: SignerWithAddress,
    poolAdmin: SignerWithAddress,
    addressProvider: AddressesProvider,
    roleManager: RoleManager,
    pool: Pool,
    pledge: Token,
    validationHelper: Contract,
) {
    console.log(` - setup trading`);

    const weth = await getWETH();
    // const usdt = await getToken();

    let feeCollector = (await deployContract('FeeCollector', [addressProvider.address])) as any as FeeCollector;

    let positionManager = (await deployContract('PositionManager', [
        addressProvider.address,
        pool.address,
        pledge.address,
        feeCollector.address,
        8 * 60 * 60,
    ])) as any as PositionManager;
    console.log(`deployed PositionManager at ${positionManager.address}`);

    let orderManager = (await deployContract('OrderManager', [
        addressProvider.address,
        pool.address,
        positionManager.address,
    ])) as any as OrderManager;
    console.log(`deployed OrderManager at ${orderManager.address}`);

    let router = (await deployContract('Router', [
        weth.address,
        addressProvider.address,
        orderManager.address,
        pool.address,
    ])) as Router;
    console.log(`deployed Router at ${router.address}`);
    await waitForTx(await orderManager.setRouter(router.address));

    const liquidationLogic = await deployContract('LiquidationLogic', []);

    let executor = (await deployContract(
        'Executor',
        [
            addressProvider.address,
            pool.address,
            orderManager.address,
            positionManager.address,
            feeCollector.address,
            60 * 10, //todo testing time
        ],
        {
            LiquidationLogic: liquidationLogic.address,
        },
    )) as any as Executor;
    console.log(`deployed Executor at ${executor.address}`);

    // await waitForTx(await orderManager.connect(poolAdmin.signer).updatePositionManager(positionManager.address));

    await positionManager.setExecutor(executor.address);
    await positionManager.setOrderManager(orderManager.address);
    await orderManager.setExecutor(executor.address);

    return { positionManager, router, executor, orderManager };
}
export async function deployMockCallback() {
    return (await deployContract('TestCallBack', [])) as TestCallBack;
}
