import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    ExecuteRouter,
    FastPriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    MockPriceFeed,
    Token,
    TradingRouter,
    TradingUtils,
    TradingVault,
    VaultPriceFeed,
    WETH,
} from '../../types';
import { deployContract, deployUpgradeableContract, getBlockTimestamp, waitForTx } from './tx';
import { getMarketSymbol, MOCK_PRICES } from '../shared/constants';
import { loadCurrentPairConfigs } from './market-config-helper';
import { SymbolMap } from '../shared/types';
import { getPairToken, SignerWithAddress, testEnv } from './make-suite';
import { ethers } from 'ethers';

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
    const usdt = await deployMockToken(getMarketSymbol());
    console.log(`deployed USDT at ${usdt.address}`);

    const weth = await deployWETH();
    console.log(`deployed WETH at ${weth.address}`);

    // pairs token
    const pairConfigs = loadCurrentPairConfigs();

    const tokens: SymbolMap<Token> = {};
    for (let pair of Object.keys(pairConfigs)) {
        const token = await deployMockToken(pair);
        console.log(`deployed ${pair} at ${token.address}`);

        tokens[pair] = token;
    }
    return { usdt, weth, tokens };
}

export async function deployPrice(deployer: SignerWithAddress, keeper: SignerWithAddress) {
    console.log(` - setup price`);

    const pairConfigs = loadCurrentPairConfigs();

    const vaultPriceFeed = (await deployContract('VaultPriceFeed', [])) as any as VaultPriceFeed;
    console.log(`deployed VaultPriceFeed at ${vaultPriceFeed.address}`);

    const pairTokenAddresses = [];
    const pairTokenPrices = [];
    for (let pair of Object.keys(pairConfigs)) {
        const priceFeed = (await deployContract('MockPriceFeed', [])) as any as MockPriceFeed;
        console.log(`deployed MockPriceFeed with ${pair} at ${priceFeed.address}`);

        await priceFeed.connect(deployer.signer).setAdmin(keeper.address, true);
        await priceFeed.connect(keeper.signer).setLatestAnswer(MOCK_PRICES[pair]);

        const pairTokenAddress = (await getPairToken(pair)).address;
        if (!pairTokenAddress) {
            throw `wait for deployed before using`;
        }
        await vaultPriceFeed.setTokenConfig(pairTokenAddress, priceFeed.address, 8);

        pairTokenAddresses.push(pairTokenAddress);
        pairTokenPrices.push(
            ethers.utils.parseUnits(ethers.utils.formatUnits(MOCK_PRICES[pair].toString(), 8).toString(), 30),
        );
    }
    await vaultPriceFeed.setPriceSampleSpace(1);

    const fastPriceFeed = (await deployContract('FastPriceFeed', [
        120 * 60, // _maxPriceUpdateDelay
        2, // _minBlockInterval
        250, // _maxDeviationBasisPoints

        deployer.address, // _tokenManager
    ])) as any as FastPriceFeed;
    console.log(`deployed FastPriceFeed at ${fastPriceFeed.address}`);

    await fastPriceFeed.initialize(1, [deployer.address], [deployer.address]);
    await fastPriceFeed.setTokens(pairTokenAddresses, [10, 10]);
    await fastPriceFeed.connect(deployer.signer).setPriceDataInterval(300);
    await fastPriceFeed.setMaxTimeDeviation(10000);
    await fastPriceFeed.setUpdater(deployer.address, true);

    await fastPriceFeed.setPrices(pairTokenAddresses, pairTokenPrices, (await getBlockTimestamp()) + 100);

    await fastPriceFeed.setVaultPriceFeed(vaultPriceFeed.address);
    await vaultPriceFeed.setSecondaryPriceFeed(fastPriceFeed.address);
    await vaultPriceFeed.setIsSecondaryPriceEnabled(false);

    return { vaultPriceFeed, fastPriceFeed };
}

export async function deployPair(vaultPriceFeed: VaultPriceFeed, deployer: SignerWithAddress, weth: WETH) {
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
    pairVault: PairVault,
    pairInfo: PairInfo,
    vaultPriceFeed: VaultPriceFeed,
    fastPriceFeed: FastPriceFeed,
) {
    console.log(` - setup trading`);

    let tradingUtils = (await deployUpgradeableContract('TradingUtils', [])) as any as TradingUtils;
    console.log(`deployed TradingUtils at ${tradingUtils.address}`);

    let tradingVault = (await deployContract('TradingVault', [])) as any as TradingVault;
    console.log(`deployed TradingVault at ${tradingVault.address}`);

    let tradingRouter = (await deployContract('TradingRouter', [])) as any as TradingRouter;
    console.log(`deployed TradingRouter at ${tradingRouter.address}`);

    let executeRouter = (await deployContract('ExecuteRouter', [])) as any as ExecuteRouter;
    console.log(`deployed ExecuteRouter at ${executeRouter.address}`);

    await tradingUtils.setContract(
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        vaultPriceFeed.address,
    );

    await tradingVault.initialize(pairInfo.address, pairVault.address, tradingUtils.address, deployer.address, 8*60*60);

    await tradingRouter.initialize(pairInfo.address, pairVault.address, tradingVault.address, tradingUtils.address);

    await executeRouter.initialize(
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        fastPriceFeed.address,
        tradingUtils.address,
        60,
    );

    await pairVault.setHandler(tradingVault.address, true);
    await tradingVault.setHandler(executeRouter.address, true);
    await tradingRouter.setHandler(executeRouter.address, true);
    await executeRouter.setPositionKeeper(testEnv.keeper.address, true);

    return { tradingUtils, tradingVault, tradingRouter, executeRouter };
}
