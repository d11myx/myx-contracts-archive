import { PairInfo, Token } from '../types';
import { loadReserveConfig } from './market-config-helper';
import { waitForTx } from './utilities/tx';
import { SignerWithAddress } from '../test/helpers/make-suite';
import { getMarketSymbol } from './constants';
import { SymbolMap } from './types';
import { MARKET_NAME } from './env';

export async function initPairs(
  deployer: SignerWithAddress,
  pairTokens: SymbolMap<Token>,
  usdt: Token,
  pairInfo: PairInfo,
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

    await waitForTx(await pairInfo.addPair(pair, tradingConfig, tradingFeeConfig, fundingFeeConfig));

    console.log(
      `added pair [${symbol}, ${getMarketSymbol()}] at index`,
      (await pairInfo.pairsCount()).sub(1).toString(),
    );
  }

  console.log(`Configured all pairs [${Object.keys(pairConfigs)}]`);
}
