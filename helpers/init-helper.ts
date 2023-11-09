import { MockERC20Token, FundingRate, Pool, FeeCollector, IFeeCollector } from '../types';
import { loadReserveConfig } from './market-config-helper';
import { MARKET_NAME } from './env';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { SymbolMap } from './types';
import { waitForTx } from './utilities/tx';
import { log } from './contract-deployments';

export async function initPairs(
    deployer: SignerWithAddress,
    pairTokens: SymbolMap<MockERC20Token>,
    usdt: MockERC20Token,
    pool: Pool,
    fundingRate: FundingRate,
    feeCollector: FeeCollector,
) {
    log(`Initializing pairs`);
    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    for (let symbol of Object.keys(pairConfigs)) {
        const pairConfig = pairConfigs[symbol];
        const pair = pairConfig.pair;
        pair.indexToken = pairTokens[symbol].address;
        pair.stableToken = usdt.address;
        const tradingConfig = pairConfig.tradingConfig;
        const tradingFeeConfig = pairConfig.tradingFeeConfig;
        const fundingFeeConfig = pairConfig.fundingFeeConfig;
        await pool.addStableToken(usdt.address);
        await waitForTx(await pool.addPair(pair.indexToken, pair.stableToken));

        let pairIndex = await pool.getPairIndex(pair.indexToken, pair.stableToken);
        await waitForTx(await pool.updatePair(pairIndex, pair));
        await waitForTx(await pool.updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pool.updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await fundingRate.updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        await waitForTx(
            await feeCollector.updateTradingFeeTiers(
                pairIndex,
                [0],
                [{ takerFee: pairConfig.tradingFeeConfig.takerFee, makerFee: pairConfig.tradingFeeConfig.makerFee }],
            ),
        );

        log(`added pair [${symbol}, ${MARKET_NAME}] at index`, (await pool.pairsIndex()).sub(1).toString());
    }

    log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
}
