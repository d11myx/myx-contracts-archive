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
    WETH9,
    Timelock,
    MockERC20Token,
    SpotSwap,
    MockPythOraclePriceFeed,
    PoolView,
    Backtracker,
} from '../types';
import { Contract, ethers } from 'ethers';
import { MARKET_NAME } from './env';
import { deployContract, deployUpgradeableContract, waitForTx } from './utilities/tx';
import { MOCK_INDEX_PRICES, MOCK_PRICES, ZERO_ADDRESS } from './constants';
import { SymbolMap } from './types';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { loadReserveConfig } from './market-config-helper';
import { getToken, getWETH } from './contract-getters';

declare var hre: HardhatRuntimeEnvironment;

export const deployMockToken = async (name: string, symbol: string, decimals: number): Promise<MockERC20Token> => {
    return await deployContract<MockERC20Token>('MockERC20Token', [name, symbol, decimals]);
};

export const deployWETH = async (): Promise<WETH9> => {
    return await deployContract<WETH9>('WETH9', []);
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

    const reserveConfig = loadReserveConfig(MARKET_NAME);

    // basic token
    const usdt = await deployMockToken(MARKET_NAME, MARKET_NAME, reserveConfig.MarketTokenDecimals);
    log(`deployed USDT at ${usdt.address}`);

    const weth = await deployWETH();
    log(`deployed WETH at ${weth.address}`);

    // pairs token
    const pairConfigs = reserveConfig?.PairsConfig;

    const tokens: SymbolMap<MockERC20Token> = {};
    for (let [pair, pairConfig] of Object.entries(pairConfigs)) {
        let token;
        if (pairConfig.useWrappedNativeToken) {
            token = await getToken(weth.address);
        } else {
            token = await deployMockToken(pair, pair, pairConfig.pairTokenDecimals);
        }
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
    tokens: SymbolMap<MockERC20Token>,
) {
    log(` - setup price`);

    const mockPyth = (await deployContract('MockPyth', [60, 1])) as any as MockPyth;

    const oraclePriceFeed = (await deployContract('MockPythOraclePriceFeed', [
        addressesProvider.address,
        mockPyth.address,
        [],
        [],
    ])) as any as MockPythOraclePriceFeed;
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
        ZERO_ADDRESS,
    ])) as any as IndexPriceFeed;
    log(`deployed IndexPriceFeed at ${indexPriceFeed.address}`);

    await indexPriceFeed.connect(deployer.signer).updatePrice(pairTokenAddresses, pairTokenIndexPrices);

    await oraclePriceFeed.connect(deployer.signer).setTokenPriceIds(pairTokenAddresses, pairTokenPriceIds);
    // await hre.run('time-execution', {
    //     target: oraclePriceFeed.address,
    //     value: '0',
    //     signature: 'setTokenPriceIds(address[],bytes32[])',
    //     data: encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
    //     eta: Duration.days(1)
    //         .add(await latest())
    //         .toString(),
    //     timelockAddress: timelock.address,
    // });

    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = mockPyth.getUpdateFee(updateData);
    const abiCoder = new ethers.utils.AbiCoder();
    const pairTokenPricesBytes = pairTokenPrices.map((value) => {
        return abiCoder.encode(['uint256'], [value]);
    });

    await oraclePriceFeed
        .connect(keeper.signer)
        .updatePrice(pairTokenAddresses, pairTokenPricesBytes, [Array(pairTokenPricesBytes.length).fill(0)], {
            value: fee,
        });

    const fundingRate = (await deployUpgradeableContract('FundingRate', [
        addressesProvider.address,
    ])) as any as FundingRate;
    log(`deployed FundingRate at ${fundingRate.address}`);

    return { oraclePriceFeed, indexPriceFeed, fundingRate };
}

export async function deployPair(
    addressProvider: AddressesProvider,
    vaultPriceFeed: MockPythOraclePriceFeed,
    deployer: SignerWithAddress,
    weth: WETH9,
) {
    log(` - setup pairs`);
    const poolTokenFactory = (await deployContract('PoolTokenFactory', [addressProvider.address])) as PoolTokenFactory;
    const pool = (await deployUpgradeableContract('Pool', [
        addressProvider.address,
        poolTokenFactory.address,
    ])) as any as Pool;
    log(`deployed Pool at ${pool.address}`);

    const poolView = (await deployUpgradeableContract('PoolView', [addressProvider.address])) as any as PoolView;
    log(`deployed PoolView at ${poolView.address}`);

    const spotSwap = (await deployUpgradeableContract('SpotSwap', [addressProvider.address])) as any as SpotSwap;
    log(`deployed SpotSwap at ${spotSwap.address}`);
    await pool.setSpotSwap(spotSwap.address);

    //TODO uniswap config
    // await pool.setRouter(ZERO_ADDRESS);
    // await pool.updateTokenPath();

    return { poolTokenFactory, pool, poolView, spotSwap };
}

export async function deployTrading(
    deployer: SignerWithAddress,
    poolAdmin: SignerWithAddress,
    addressProvider: AddressesProvider,
    roleManager: RoleManager,
    pool: Pool,
    pledge: MockERC20Token,
    validationHelper: Contract,
) {
    log(` - setup trading`);

    // const weth = await getWETH();
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
        addressProvider.address,
        orderManager.address,
        positionManager.address,
        pool.address,
    ])) as Router;
    log(`deployed Router at ${router.address}`);
    await waitForTx(await orderManager.setRouter(router.address));
    await waitForTx(await positionManager.setRouter(router.address));

    let liquidationLogic = (await deployContract('LiquidationLogic', [
        addressProvider.address,
        pool.address,
        orderManager.address,
        positionManager.address,
        feeCollector.address,
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

    let executor = (await deployContract('Executor', [addressProvider.address])) as any as Executor;
    log(`deployed Executor at ${executor.address}`);

    let backtracker = (await deployContract('Backtracker', [])) as any as Backtracker;
    log(`deployed Backtracker at ${backtracker.address}`);

    await waitForTx(await feeCollector.updatePositionManagerAddress(positionManager.address));
    await waitForTx(await feeCollector.updateExecutionLogicAddress(executionLogic.address));

    await waitForTx(await pool.connect(poolAdmin.signer).setRiskReserve(riskReserve.address));
    await waitForTx(await pool.connect(poolAdmin.signer).setFeeCollector(feeCollector.address));

    await waitForTx(await riskReserve.connect(poolAdmin.signer).updatePositionManagerAddress(positionManager.address));
    await waitForTx(await riskReserve.connect(poolAdmin.signer).updatePoolAddress(pool.address));

    await waitForTx(await executionLogic.connect(poolAdmin.signer).updateExecutor(executor.address));
    await waitForTx(await liquidationLogic.connect(poolAdmin.signer).updateExecutor(executor.address));

    return {
        positionManager,
        router,
        executionLogic,
        liquidationLogic,
        executor,
        orderManager,
        riskReserve,
        feeCollector,
        backtracker,
    };
}
