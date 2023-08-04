import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    ExecuteRouter,
    IndexPriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    MockPriceFeed,
    Token,
    TradingRouter,
    TradingVault,
    OraclePriceFeed,
    WETH,
    AddressesProvider,
    Router,
    Executor,
    OrderManager,
    RoleManager,
    PositionManager,
} from '../types';
import { ethers } from 'ethers';
import { MARKET_NAME } from './env';
import { deployContract, deployUpgradeableContract, getBlockTimestamp, waitForTx } from './utilities/tx';
import { MOCK_PRICES } from './constants';
import { SymbolMap } from './types';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { loadReserveConfig } from './market-config-helper';

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

    const vaultPriceFeed = (await deployContract('OraclePriceFeed', [
        addressesProvider.address,
    ])) as any as OraclePriceFeed;
    console.log(`deployed OraclePriceFeed at ${vaultPriceFeed.address}`);

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
        await vaultPriceFeed.setTokenConfig(pairTokenAddress, priceFeed.address, 8);

        pairTokenAddresses.push(pairTokenAddress);
        pairTokenPrices.push(
            ethers.utils.parseUnits(ethers.utils.formatUnits(MOCK_PRICES[pair].toString(), 8).toString(), 30),
        );
    }

    const fastPriceFeed = (await deployContract('IndexPriceFeed', [
        addressesProvider.address,
    ])) as any as IndexPriceFeed;
    console.log(`deployed IndexPriceFeed at ${fastPriceFeed.address}`);

    await fastPriceFeed.connect(deployer.signer).setTokens(pairTokenAddresses, [10, 10]);

    await fastPriceFeed.connect(deployer.signer).setMaxTimeDeviation(10000);

    await fastPriceFeed
        .connect(keeper.signer)
        .setPrices(pairTokenAddresses, pairTokenPrices, (await getBlockTimestamp()) + 100);

    await vaultPriceFeed.setIndexPriceFeed(fastPriceFeed.address);

    return { vaultPriceFeed, fastPriceFeed };
}

export async function deployPair(vaultPriceFeed: OraclePriceFeed, deployer: SignerWithAddress, weth: WETH) {
    console.log(` - setup pairs`);

    const pairInfo = (await deployUpgradeableContract('PairInfo', [])) as any as PairInfo;
    console.log(`deployed PairInfo at ${pairInfo.address}`);

    const pairVault = (await deployUpgradeableContract('PairVault', [pairInfo.address])) as any as PairVault;
    console.log(`deployed PairVault at ${pairVault.address}`);

    const pairLiquidity = (await deployUpgradeableContract('PairLiquidity', [
        pairInfo.address,
        pairVault.address,
        vaultPriceFeed.address,
        deployer.address,
        deployer.address,
        weth.address,
    ])) as any as PairLiquidity;
    console.log(`deployed PairLiquidity at ${pairLiquidity.address}`);

    await waitForTx(await pairLiquidity.setHandler(pairInfo.address, true));
    await waitForTx(await pairVault.setHandler(pairLiquidity.address, true));

    return { pairInfo, pairLiquidity, pairVault };
}

export async function deployTrading(
    deployer: SignerWithAddress,
    keeper: SignerWithAddress,
    addressProvider: AddressesProvider,
    roleManager: RoleManager,
    pairVault: PairVault,
    pairInfo: PairInfo,
    vaultPriceFeed: OraclePriceFeed,
    fastPriceFeed: IndexPriceFeed,
) {
    console.log(` - setup trading`);

    let tradingVault = (await deployContract('TradingVault', [])) as any as TradingVault;
    console.log(`deployed TradingVault at ${tradingVault.address}`);

    let tradingRouter = (await deployContract('TradingRouter', [])) as any as TradingRouter;
    console.log(`deployed TradingRouter at ${tradingRouter.address}`);

    let executeRouter = (await deployContract('ExecuteRouter', [])) as any as ExecuteRouter;
    console.log(`deployed ExecuteRouter at ${executeRouter.address}`);

    let orderManager = (await deployContract('OrderManager', [
        addressProvider.address,
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        vaultPriceFeed.address,
    ])) as any as OrderManager;
    console.log(`deployed OrderManager at ${orderManager.address}`);

    let router = (await deployContract('Router', [
        addressProvider.address,
        tradingRouter.address,
        orderManager.address,
    ])) as any as Router;
    console.log(`deployed Router at ${router.address}`);

    let positionManager = (await deployContract('PositionManager', [
        addressProvider.address,
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        vaultPriceFeed.address,
        fastPriceFeed.address,
        60,
        orderManager.address,
        router.address,
    ])) as any as PositionManager;
    console.log(`deployed PositionManager at ${positionManager.address}`);

    let executor = (await deployContract('Executor', [
        addressProvider.address,
        executeRouter.address,
        positionManager.address,
    ])) as any as Executor;
    console.log(`deployed Executor at ${executor.address}`);

    await tradingVault.initialize(
        pairInfo.address,
        pairVault.address,
        vaultPriceFeed.address,
        deployer.address,
        8 * 60 * 60,
    );

    await tradingRouter.initialize(pairInfo.address, pairVault.address, tradingVault.address, vaultPriceFeed.address);

    await executeRouter.initialize(
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        vaultPriceFeed.address,
        fastPriceFeed.address,
        60,
    );

    await waitForTx(await roleManager.connect(deployer.signer).addContractWhiteList(router.address));
    await waitForTx(await roleManager.connect(deployer.signer).addContractWhiteList(executor.address));
    await waitForTx(await roleManager.connect(deployer.signer).addContractWhiteList(orderManager.address));
    await waitForTx(await roleManager.connect(deployer.signer).addContractWhiteList(positionManager.address));

    await pairVault.setHandler(tradingVault.address, true);
    await tradingVault.setHandler(executeRouter.address, true);
    await tradingRouter.setHandler(executeRouter.address, true);
    await tradingRouter.setHandler(router.address, true);
    await tradingRouter.setHandler(orderManager.address, true);
    await tradingRouter.setHandler(positionManager.address, true);
    await executeRouter.setPositionKeeper(keeper.address, true);
    await executeRouter.setPositionKeeper(executor.address, true);

    return { tradingVault, tradingRouter, executeRouter, router, executor, orderManager, positionManager };
}
