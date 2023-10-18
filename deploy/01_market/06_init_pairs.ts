import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    getMockToken,
    getOrderManager,
    getPool,
    getFundingRate,
    getToken,
    loadReserveConfig,
    MARKET_NAME,
    waitForTx,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deployer, poolAdmin } = await getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const pool = await getPool();
    const fundingRate = await getFundingRate();
    // const pairLiquidity = await getPairLiquidity();
    const orderManager = await getOrderManager();
    // const positionManager = await getPositionManager();

    for (let symbol of Object.keys(pairConfigs)) {
        const pairToken = await getMockToken(symbol);
        const basicToken = await getToken();

        const pairConfig = pairConfigs[symbol];
        const pair = pairConfig.pair;
        pair.indexToken = pairToken.address;
        pair.stableToken = basicToken.address;
        const tradingConfig = pairConfig.tradingConfig;
        const tradingFeeConfig = pairConfig.tradingFeeConfig;
        const fundingFeeConfig = pairConfig.fundingFeeConfig;

        await waitForTx(await pool.connect(poolAdminSigner).addStableToken(pair.stableToken));
        await waitForTx(await pool.connect(poolAdminSigner).addPair(pair.indexToken, pair.stableToken));

        let pairIndex = await pool.connect(poolAdminSigner).getPairIndex(pair.indexToken, pair.stableToken);
        await waitForTx(await pool.connect(poolAdminSigner).updatePair(pairIndex, pair));
        await waitForTx(await pool.connect(poolAdminSigner).updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pool.connect(poolAdminSigner).updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await fundingRate.connect(poolAdminSigner).updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        console.log(`added pair [${symbol}/${MARKET_NAME}] at index`, (await pool.pairsIndex()).sub(1).toString());
        console.log(`pairToken for [${symbol}/${MARKET_NAME}]: ${(await pool.pairs(pairIndex)).pairToken}`);
    }
    console.log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
};
func.id = `InitPairs`;
func.tags = ['market', 'init-pairs'];
export default func;
