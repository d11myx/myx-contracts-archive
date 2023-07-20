import { testEnv } from './helpers/make-suite';
import { describe } from 'mocha';
import { expect } from './shared/expect';
import { pairConfigs } from './shared/config';
import { waitForTx } from './helpers/tx';

describe('PairInfo: Edge cases', () => {
  // before('deploy Pair', async () => {
  //   const { deployer } = testEnv;
  //   console.log(`deployer address:`, deployer.address);
  //
  //   const pairInfoFactory = await ethers.getContractFactory('PairInfo', deployer.signer);
  //   const pairInfo = await pairInfoFactory.deploy();
  //
  //   console.log(`pairInfo address:`, pairInfo.address);
  // });

  it('check getters', async () => {
    const { deployer, pairInfo, pairLiquidity } = testEnv;

    expect(await pairInfo.pairLiquidity()).to.be.eq(pairLiquidity.address);
  });

  describe('test addPair', async () => {
    before('addPair', async () => {
      const { deployer, pairInfo, btc, usdt } = testEnv;

      const btcPair = pairConfigs['BTC_USDT'];

      const pair = btcPair.pair;
      pair.indexToken = btc.address;
      pair.stableToken = usdt.address;
      const tradingConfig = btcPair.tradingConfig;
      const tradingFeeConfig = btcPair.tradingFeeConfig;
      const fundingFeeConfig = btcPair.fundingFeeConfig;

      await waitForTx(await pairInfo.addPair(pair, tradingConfig, tradingFeeConfig, fundingFeeConfig));

      expect(await pairInfo.pairsCount()).to.be.eq(1);
    });

    it('check pair info', async () => {
      const { pairInfo, btc, usdt } = testEnv;

      const pairIndex = 0;
      // console.log(await pairInfo.pairs(pairIndex));
      // console.log(await pairInfo.getPair(pairIndex));

      expect(await pairInfo.pairs(pairIndex)).deep.be.eq(await pairInfo.getPair(pairIndex));
      expect(await pairInfo.tradingConfigs(pairIndex)).deep.be.eq(await pairInfo.getTradingConfig(pairIndex));
      expect(await pairInfo.tradingFeeConfigs(pairIndex)).deep.be.eq(await pairInfo.getTradingFeeConfig(pairIndex));
      expect(await pairInfo.fundingFeeConfigs(pairIndex)).deep.be.eq(await pairInfo.getFundingFeeConfig(pairIndex));

      const btcPair = pairConfigs['BTC_USDT'];
      const pair = await pairInfo.getPair(pairIndex);
      expect(pair.indexToken).to.be.eq(btc.address);
      expect(pair.stableToken).to.be.eq(usdt.address);
      expect(pair.enable).to.be.eq(btcPair.pair.enable);
    });
  });

  describe('test updatePair', async () => {
    it('check updated pair', async () => {});
  });
});
