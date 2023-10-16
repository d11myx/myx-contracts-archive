import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    AddressesProvider,
    ExecutionLogic,
    Executor,
    FeeCollector,
    FundingRate,
    IndexPriceFeed,
    LiquidationLogic,
    MockPyth,
    PythOraclePriceFeed,
    OrderManager,
    Pool,
    PoolTokenFactory,
    PositionManager,
    RiskReserve,
    RoleManager,
    Router,
    TestCallBack,
    Token,
    WETH,
    Timelock,
} from '../types';
import { Contract, ethers } from 'ethers';
import { MARKET_NAME } from './env';
import { Duration, deployContract, deployUpgradeableContract, encodeParameterArray, increase, latest, waitForTx } from './utilities/tx';
import { MOCK_INDEX_PRICES, MOCK_PRICES } from './constants';
import { SymbolMap } from './types';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { loadReserveConfig } from './market-config-helper';
import { getWETH } from './contract-getters';
import { POSITION_MANAGER_ID } from './deploy-ids';
import usdt from '../markets/usdt';

declare var hre: HardhatRuntimeEnvironment;

export const deployMockToken = async (symbol: string): Promise<Token> => {
    return await deployContract<Token>('Token', [symbol]);
};

export const deployWETH = async (): Promise<WETH> => {
    return await deployContract<WETH>('WETH', ['WETH', 'WETH', '18']);
};

const logFlag = false;

export function log(message?: any, ...optionalParams: any[]) {
    if (logFlag) {
        console.log(message, ...optionalParams);
    }
}

export async function deployLibraries() {
    log(` - setup libraries`);

    const validationHelper = await deployContract('ValidationHelper', []);
    log(`deployed ValidationHelper at ${validationHelper.address}`);

    return {
        validationHelper,
    };
}

export async function deployToken() {
    log(` - setup tokens`);

    // basic token
    const usdt = await deployMockToken(MARKET_NAME);
    log(`deployed USDT at ${usdt.address}`);

    const weth = await deployWETH();
    log(`deployed WETH at ${weth.address}`);

    // pairs token
    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const tokens: SymbolMap<Token> = {};
    for (let pair of Object.keys(pairConfigs)) {
        const token = await deployMockToken(pair);
        log(`deployed ${pair} at ${token.address}`);

        tokens[pair] = token;
    }
    return { usdt, weth, tokens };
}

export async function deployPrice(
    deployer: SignerWithAddress,
    keeper: SignerWithAddress,
    timelock: Timelock,
    addressesProvider: AddressesProvider,
    tokens: SymbolMap<Token>,
) {
    log(` - setup price`);

    const mockPyth = (await deployContract('MockPyth', [60, 1])) as any as MockPyth;

    const oraclePriceFeed = (await deployContract('PythOraclePriceFeed', [
        addressesProvider.address,
        mockPyth.address,
        [],
        [],
    ])) as any as PythOraclePriceFeed;
    log(`deployed PythOraclePriceFeed at ${oraclePriceFeed.address}`);

    const pairTokenAddresses = [];
    const pairTokenPrices = [];
    const pairTokenIndexPrices = [];
    const pairTokenPriceIds = [];
    for (let [pair, token] of Object.entries(tokens)) {
        const pairTokenAddress = token.address;
        if (!pairTokenAddress) {
            throw `wait for deployed before using`;
        }

        pairTokenAddresses.push(pairTokenAddress);
        pairTokenPrices.push(MOCK_PRICES[pair]);
        pairTokenIndexPrices.push(MOCK_INDEX_PRICES[pair]);
        pairTokenPriceIds.push(ethers.utils.formatBytes32String(pair));
    }

    const indexPriceFeed = (await deployContract('IndexPriceFeed', [
        addressesProvider.address,
        [],
        [],
    ])) as any as IndexPriceFeed;
    log(`deployed IndexPriceFeed at ${indexPriceFeed.address}`);

    await indexPriceFeed.connect(keeper.signer).updatePrice(pairTokenAddresses, pairTokenIndexPrices);

    let timestamp = await latest();
    let eta = Duration.days(1);
    await timelock.queueTransaction(
        oraclePriceFeed.address,
        0,
        'setAssetPriceIds(address[],bytes32[])',
        encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
        eta.add(timestamp),
    );
    await increase(Duration.days(1));
    await waitForTx(
        await timelock.executeTransaction(
            oraclePriceFeed.address,
            0,
            'setAssetPriceIds(address[],bytes32[])',
            encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
            eta.add(timestamp),
        ),
    );
    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = mockPyth.getUpdateFee(updateData);
    await oraclePriceFeed.connect(keeper.signer).updatePrice(pairTokenAddresses, pairTokenPrices, { value: fee });

    const fundingRate = (await deployUpgradeableContract('FundingRate', [
        addressesProvider.address,
    ])) as any as FundingRate;
    log(`deployed FundingRate at ${fundingRate.address}`);

    await addressesProvider
        .connect(deployer.signer)
        .initialize(oraclePriceFeed.address, indexPriceFeed.address, fundingRate.address);
    return { oraclePriceFeed, indexPriceFeed, fundingRate };
}

export async function deployPair(
    addressProvider: AddressesProvider,
    vaultPriceFeed: PythOraclePriceFeed,
    deployer: SignerWithAddress,
    weth: WETH,
) {
    log(` - setup pairs`);
    const poolTokenFactory = (await deployContract('PoolTokenFactory', [addressProvider.address])) as PoolTokenFactory;
    const pool = (await deployUpgradeableContract('Pool', [
        addressProvider.address,
        poolTokenFactory.address,
    ])) as any as Pool;
    log(`deployed Pool at ${pool.address}`);

    //TODO uniswap config
    // await pool.setRouter(ZERO_ADDRESS);
    // await pool.updateTokenPath();

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
    log(` - setup trading`);

    const weth = await getWETH();
    // const usdt = await getToken();

    let feeCollector = (await deployUpgradeableContract('FeeCollector', [
        addressProvider.address,
        pool.address,
        pledge.address,
    ])) as any as FeeCollector;
    let riskReserve = (await deployUpgradeableContract('RiskReserve', [
        deployer.address,
        addressProvider.address,
    ])) as any as RiskReserve;

    let positionManager = (await deployUpgradeableContract('PositionManager', [
        addressProvider.address,
        pool.address,
        pledge.address,
        feeCollector.address,
        riskReserve.address,
    ])) as any as PositionManager;
    log(`deployed PositionManager at ${positionManager.address}`);

    let orderManager = (await deployUpgradeableContract('OrderManager', [
        addressProvider.address,
        pool.address,
        positionManager.address,
    ])) as any as OrderManager;
    log(`deployed OrderManager at ${orderManager.address}`);

    let router = (await deployContract('Router', [
        weth.address,
        addressProvider.address,
        orderManager.address,
        pool.address,
    ])) as Router;
    log(`deployed Router at ${router.address}`);
    await waitForTx(await orderManager.setRouter(router.address));

    let liquidationLogic = (await deployContract('LiquidationLogic', [
        addressProvider.address,
        pool.address,
        orderManager.address,
        positionManager.address,
    ])) as any as LiquidationLogic;
    log(`deployed LiquidationLogic at ${liquidationLogic.address}`);

    let executionLogic = (await deployContract('ExecutionLogic', [
        addressProvider.address,
        pool.address,
        orderManager.address,
        positionManager.address,
        feeCollector.address,
        60 * 10, //todo testing time
    ])) as any as ExecutionLogic;
    log(`deployed ExecutionLogic at ${executionLogic.address}`);

    let executor = (await deployUpgradeableContract('Executor', [
        addressProvider.address,
        executionLogic.address,
        liquidationLogic.address,
    ])) as any as Executor;
    log(`deployed Executor at ${executor.address}`);
    log(`executionLogic pool : ${await executor.executionLogic()}`);

    await waitForTx(await feeCollector.updatePositionManagerAddress(positionManager.address));

    await waitForTx(await pool.connect(poolAdmin.signer).setRiskReserve(riskReserve.address));
    await waitForTx(await pool.connect(poolAdmin.signer).setFeeCollector(feeCollector.address));

    await waitForTx(await riskReserve.connect(poolAdmin.signer).updatePositionManagerAddress(positionManager.address));
    await waitForTx(await riskReserve.connect(poolAdmin.signer).updatePoolAddress(pool.address));

    await waitForTx(await executionLogic.connect(poolAdmin.signer).updateExecutor(executor.address));
    await waitForTx(await liquidationLogic.connect(poolAdmin.signer).updateExecutor(executor.address));

    await positionManager.updateExecutionLogic(executionLogic.address);
    await positionManager.updateLiquidationLogic(liquidationLogic.address);
    // await positionManager.addLogic(orderManager.address);
    await orderManager.setExecutionLogic(executionLogic.address);
    await orderManager.setLiquidationLogic(liquidationLogic.address);

    return {
        positionManager,
        router,
        executionLogic,
        liquidationLogic,
        executor,
        orderManager,
        riskReserve,
        feeCollector,
    };
}
export async function deployMockCallback() {
    return (await deployContract('TestCallBack', [])) as TestCallBack;
}
