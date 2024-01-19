import { MockERC20Token, FundingRate, Pool, FeeCollector, IFeeCollector } from '../types';
import { loadReserveConfig } from './market-config-helper';
import { MARKET_NAME } from './env';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { SymbolMap } from './types';
import { waitForTx } from './utilities/tx';
import { log } from './contract-deployments';
import { ethers } from 'ethers';

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

        // override
        if (pairIndex.toNumber() == 1) {
            pair.kOfSwap = ethers.utils.parseUnits('1', 50);
            pair.addLpFeeP = 100000;
            pair.removeLpFeeP = 100000;

            tradingConfig.minTradeAmount = '1000000';
            tradingConfig.maxTradeAmount = '1000000000000';
            tradingConfig.maxPositionAmount = '100000000000000';
            tradingConfig.priceSlipP = 100000;
            tradingConfig.maxPriceDeviationP = 500000;

            tradingFeeConfig.takerFee = 80000;
            tradingFeeConfig.makerFee = 55000;
            tradingFeeConfig.lpFeeDistributeP = 30000000;
            tradingFeeConfig.keeperFeeDistributeP = 20000000;
            tradingFeeConfig.stakingFeeDistributeP = 10000000;
            tradingFeeConfig.treasuryFeeDistributeP = 0;
            tradingFeeConfig.reservedFeeDistributeP = 0;
            tradingFeeConfig.ecoFundFeeDistributeP = 0;
        }

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
