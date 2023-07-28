import { testEnv } from './helpers/make-suite';
import { waitForTx } from './helpers/tx';
import { loadPairConfigs } from './helpers/market-config-helper';
import { expect } from './shared/expect';
import { IPairInfo } from '../types';
import { BigNumber } from 'ethers';
import { deployMockToken } from './helpers/contract-deployments';

describe('PairInfo: Edge cases', () => {
    before('addPair', async () => {
        const { pairInfo, usdt } = testEnv;

        const token = await deployMockToken('Test');
        const btcPair = loadPairConfigs('USDT')['BTC'];

        const pair = btcPair.pair;
        pair.indexToken = token.address;
        pair.stableToken = usdt.address;
        const tradingConfig = btcPair.tradingConfig;
        const tradingFeeConfig = btcPair.tradingFeeConfig;
        const fundingFeeConfig = btcPair.fundingFeeConfig;

        const countBefore = await pairInfo.pairsCount();
        await waitForTx(await pairInfo.addPair(pair, tradingConfig, tradingFeeConfig, fundingFeeConfig));

        const countAfter = await pairInfo.pairsCount();
        expect(countAfter).to.be.eq(countBefore.add(1));
    });

    it('check pair info', async () => {
        const { pairInfo, btc, usdt } = testEnv;

        const pairIndex = 0;

        expect(await pairInfo.pairs(pairIndex)).deep.be.eq(await pairInfo.getPair(pairIndex));
        expect(await pairInfo.tradingConfigs(pairIndex)).deep.be.eq(await pairInfo.getTradingConfig(pairIndex));
        expect(await pairInfo.tradingFeeConfigs(pairIndex)).deep.be.eq(await pairInfo.getTradingFeeConfig(pairIndex));
        expect(await pairInfo.fundingFeeConfigs(pairIndex)).deep.be.eq(await pairInfo.getFundingFeeConfig(pairIndex));

        const btcPair = loadPairConfigs('USDT')['BTC'];
        const pair = await pairInfo.getPair(pairIndex);
        expect(pair.indexToken).to.be.eq(btc.address);
        expect(pair.stableToken).to.be.eq(usdt.address);
        expect(pair.enable).to.be.eq(btcPair.pair.enable);
    });

    describe('test updatePair', async () => {
        it('unHandler updatePair should be reverted', async () => {
            const {
                pairInfo,
                users: [unHandler],
            } = testEnv;

            const pairIndex = 0;
            const pair = await pairInfo.getPair(pairIndex);
            await expect(pairInfo.connect(unHandler.signer).updatePair(pairIndex, pair)).to.be.revertedWith(
                'Handleable: forbidden',
            );
        });

        it('check update pair', async () => {
            const { deployer, pairInfo } = testEnv;

            const pairIndex = 0;
            const pairBefore = await pairInfo.getPair(pairIndex);

            // updatePair
            let pairToUpdate: IPairInfo.PairStructOutput = { ...pairBefore };
            pairToUpdate.enable = !pairBefore.enable;
            pairToUpdate.kOfSwap = BigNumber.from(99999999);
            pairToUpdate.initPrice = BigNumber.from(999);
            await waitForTx(await pairInfo.connect(deployer.signer).updatePair(pairIndex, pairToUpdate));

            const pairAfterObj = await pairInfo.getPair(pairIndex);
            let pairAfter: IPairInfo.PairStructOutput = { ...pairAfterObj };

            console.log(pairAfter);
            console.log(pairToUpdate);
            //TODO Fix:updatePair unSuccessful

            // expect(pairAfter).deep.be.eq(pairToUpdate);

            // expect(pairAfter.enable).to.be.eq(pairToUpdate.enable);
            // expect(pairAfter.kOfSwap).to.be.eq(pairToUpdate.kOfSwap);
            // expect(pairAfter.initPrice).to.be.eq(pairToUpdate.initPrice);
        });
    });
});