import {PairInfo, Token, PairLiquidity} from '../../types';
import {loadPairConfigs} from './market-config-helper';
import {waitForTx} from './tx';
import {SignerWithAddress} from './make-suite';
import {getMarketSymbol} from '../shared/constants';
import {SymbolMap} from '../shared/types';

export async function initPairs(
    deployer: SignerWithAddress,
    pairTokens: SymbolMap<Token>,
    usdt: Token,
    pairInfo: PairInfo,
    pairLiquidity: PairLiquidity
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

        await waitForTx(await pairInfo.addPair(pair.indexToken, pair.stableToken, pairLiquidity.address));

        let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
        await waitForTx(await pairInfo.updatePair(pairIndex, pair));
        await waitForTx(await pairInfo.updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pairInfo.updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(await pairInfo.updateFundingFeeConfig(pairIndex, fundingFeeConfig));

        console.log(
            `added pair [${symbol}, ${getMarketSymbol()}] at index`,
            (await pairInfo.pairsCount()).sub(1).toString(),
        );
    }

    console.log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
}
