import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    eNetwork,
    getFundingRate,
    getMockToken,
    getPool,
    getSpotSwap,
    getToken,
    getWETH,
    loadReserveConfig,
    MARKET_NAME,
    SymbolMap,
    waitForTx,
    ZERO_ADDRESS,
    ZERO_HASH,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { poolAdmin } = await getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const network = hre.network.name as eNetwork;
    const reserveConfig = loadReserveConfig(MARKET_NAME);
    const pairConfigs = reserveConfig?.PairsConfig;

    const fundingRate = await getFundingRate();
    const pool = await getPool();

    // setup pairs
    console.log(`- setup pairs`);
    for (let symbol of Object.keys(pairConfigs)) {
        const pairConfig = pairConfigs[symbol];

        const basicToken = await getToken();
        let pairToken;
        if (pairConfig.useWrappedNativeToken) {
            pairToken = await getWETH();
        } else {
            pairToken = await getMockToken(symbol);
        }

        const pair = pairConfig.pair;
        pair.indexToken = pairToken.address;
        pair.stableToken = basicToken.address;
        const tradingConfig = pairConfig.tradingConfig;
        const tradingFeeConfig = pairConfig.tradingFeeConfig;
        const fundingFeeConfig = pairConfig.fundingFeeConfig;

        // add pair
        await waitForTx(await pool.connect(poolAdminSigner).addStableToken(pair.stableToken));
        await waitForTx(await pool.connect(poolAdminSigner).addPair(pair.indexToken, pair.stableToken));

        // config pair info
        let pairIndex = await pool.connect(poolAdminSigner).getPairIndex(pair.indexToken, pair.stableToken);
        await waitForTx(await pool.connect(poolAdminSigner).updatePair(pairIndex, pair));
        await waitForTx(await pool.connect(poolAdminSigner).updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pool.connect(poolAdminSigner).updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await fundingRate.connect(poolAdminSigner).updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        console.log(` - added pair【${symbol}/${MARKET_NAME}】at index【${pairIndex}】`);
        console.log(`   pair token for【${symbol}/${MARKET_NAME}】: ${(await pool.pairs(pairIndex)).pairToken}`);
    }
    console.log(`Configured all pairs 【(${Object.keys(pairConfigs)})/${MARKET_NAME}】`);

    const spotSwap = await getSpotSwap();
    await waitForTx(await pool.connect(poolAdminSigner).setSpotSwap(spotSwap.address));

    // uniswap config
    const uniswapRouterAddress = reserveConfig.UniswapRouterAddress[network] as string;
    if (!uniswapRouterAddress || uniswapRouterAddress == ZERO_ADDRESS) {
        console.log(`[warring] Uniswap router address not provided`);
    } else {
        await waitForTx(await spotSwap.connect(poolAdminSigner).setSwapRouter(uniswapRouterAddress));
    }

    // uniswap token path
    for (let symbol of Object.keys(pairConfigs)) {
        const pairConfig = pairConfigs[symbol];

        let indexToken;
        if (pairConfig.useWrappedNativeToken) {
            indexToken = await getWETH();
        } else {
            indexToken = await getMockToken(symbol);
        }
        const basicToken = await getToken();

        const tokenPathConfigs = reserveConfig?.UniswapTokenPathConfig[network] as SymbolMap<string>;
        if (!tokenPathConfigs || !tokenPathConfigs[symbol] || tokenPathConfigs[symbol] == ZERO_HASH) {
            console.log(`[warring] Uniswap TokenPath for【${symbol}/${MARKET_NAME}】not provided`);
        } else {
            const pairIndex = await pool.getPairIndex(indexToken.address, basicToken.address);
            await waitForTx(
                await spotSwap
                    .connect(poolAdminSigner)
                    .updateTokenPath(indexToken.address, basicToken.address, tokenPathConfigs[symbol]),
            );
            console.log(`[deployment] Uniswap TokenPath for【${symbol}/${MARKET_NAME}】updated`);
        }
    }
};

func.id = `PoolSetup`;
func.tags = ['market', 'pool-setup'];
export default func;
