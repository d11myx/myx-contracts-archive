import { Pool, Token } from '../types';
import { loadReserveConfig } from './market-config-helper';
import { MARKET_NAME } from './env';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { SymbolMap } from './types';
import { waitForTx } from './utilities/tx';

export async function initPairs(
    deployer: SignerWithAddress,
    pairTokens: SymbolMap<Token>,
    usdt: Token,
    pool: Pool
) {
    console.log(`Initializing pairs`);
    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    for (let symbol of Object.keys(pairConfigs)) {
        const pairConfig = pairConfigs[symbol];
        const pair = pairConfig.pair;
        pair.indexToken = pairTokens[symbol].address;
        pair.stableToken = usdt.address;
        const tradingConfig = pairConfig.tradingConfig;
        const tradingFeeConfig = pairConfig.tradingFeeConfig;
        const fundingFeeConfig = pairConfig.fundingFeeConfig;

        await waitForTx(await pool.addPair(pair.indexToken, pair.stableToken));

        let pairIndex = await pool.pairIndexes(pair.indexToken, pair.stableToken);
        await waitForTx(await pool.updatePair(pairIndex, pair));
        await waitForTx(await pool.updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pool.updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await pool.updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        console.log(`added pair [${symbol}, ${MARKET_NAME}] at index`, (await pool.pairsCount()).sub(1).toString());
    }

    console.log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
}
