import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    IndexPriceFeed,
    Pool,
    PoolLiquidity,
    MockPriceFeed,
    Token,
    PositionManager,
    OraclePriceFeed,
    WETH,
    AddressesProvider,
    Router,
    Executor,
    OrderManager,
    RoleManager,
} from '../types';
import { ethers } from 'ethers';
import { MARKET_NAME } from './env';
import { deployContract, getBlockTimestamp, waitForTx } from './utilities/tx';
import { MOCK_PRICES } from './constants';
import { SymbolMap } from './types';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { loadReserveConfig } from './market-config-helper';
import { address } from 'hardhat/internal/core/config/config-validation';
import { getWETH } from './contract-getters';

declare var hre: HardhatRuntimeEnvironment;

export const deployMockToken = async (symbol: string): Promise<Token> => {
    return await deployContract<Token>('Token', [symbol]);
};

export const deployWETH = async (): Promise<WETH> => {
    return await deployContract<WETH>('WETH', ['WETH', 'WETH', '18']);
};

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

    const pairInfo = (await deployContract('Pool', [
        addressProvider.address,
        deployer.address,
        deployer.address,
    ])) as any as Pool;
    console.log(`deployed Pool at ${pairInfo.address}`);

    // const pairLiquidity = (await deployContract('PoolLiquidity', [
    //     addressProvider.address,
    //     pairInfo.address,
    //     deployer.address,
    //     deployer.address,
    //     // weth.address,
    // ])) as any as PoolLiquidity;
    // console.log(`deployed PoolLiquidity at ${pairLiquidity.address}`);
    await pairInfo.setPairLiquidityAndVault(pairInfo.address, pairInfo.address);

    return { pairInfo };
}

export async function deployTrading(
    deployer: SignerWithAddress,
    poolAdmin: SignerWithAddress,
    addressProvider: AddressesProvider,
    roleManager: RoleManager,
    pairInfo: Pool,
    oraclePriceFeed: OraclePriceFeed,
    indexPriceFeed: IndexPriceFeed,
) {
    console.log(` - setup trading`);

    let tradingVault = (await deployContract('PositionManager', [
        addressProvider.address,
        pairInfo.address,
        deployer.address,
        8 * 60 * 60,
    ])) as any as PositionManager;
    console.log(`deployed PositionManager at ${tradingVault.address}`);

    let orderManager = (await deployContract('OrderManager', [
        addressProvider.address,
        pairInfo.address,
        tradingVault.address,
    ])) as any as OrderManager;
    console.log(`deployed OrderManager at ${orderManager.address}`);

    // let positionManager = (await deployContract('PositionManager', [
    //     addressProvider.address,
    //     pairInfo.address,
    //     pairVault.address,
    //     tradingVault.address,
    //     oraclePriceFeed.address,
    //     indexPriceFeed.address,
    //     orderManager.address,
    // ])) as any as PositionManager;
    // console.log(`deployed PositionManager at ${positionManager.address}`);
    const weth = await getWETH();
    let router = (await deployContract('Router', [
        weth.address,
        addressProvider.address,
        orderManager.address,
    ])) as Router;
    console.log(`deployed Router at ${router.address}`);
    await orderManager.setRouter(router.address);
    let executor = (await deployContract('Executor', [
        addressProvider.address,
        pairInfo.address,
        orderManager.address,
        tradingVault.address,
        60,
    ])) as any as Executor;
    console.log(`deployed Executor at ${executor.address}`);

    await waitForTx(await orderManager.connect(poolAdmin.signer).updatePositionManager(tradingVault.address));

    await tradingVault.setExecutor(executor.address);
    await orderManager.setExecutor(executor.address);

    return { tradingVault, router, executor, orderManager };
}
