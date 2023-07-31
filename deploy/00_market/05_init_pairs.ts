import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    getMockToken,
    getPairInfo,
    getPairLiquidity,
    getToken,
    loadReserveConfig,
    MARKET_NAME,
    waitForTx,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const pairInfo = await getPairInfo();
    const pairLiquidity = await getPairLiquidity();

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

        await waitForTx(await pairInfo.addPair(pair.indexToken, pair.stableToken, pairLiquidity.address));

        let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
        await waitForTx(await pairInfo.updatePair(pairIndex, pair));
        await waitForTx(await pairInfo.updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pairInfo.updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await pairInfo.updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        console.log(`added pair [${symbol}/${MARKET_NAME}] at index`, (await pairInfo.pairsCount()).sub(1).toString());
    }
    console.log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
};
func.id = `InitPairs`;
func.tags = ['market', 'init-pairs'];
export default func;
