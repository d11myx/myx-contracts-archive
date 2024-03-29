import { testEnv } from './helpers/make-suite';
import { waitForTx, loadReserveConfig, deployMockToken, MARKET_NAME } from '../helpers';
import { expect } from 'chai';
import { IPool } from '../types';
import { BigNumber } from 'ethers';

describe('Pool: Edge cases', () => {
    before('addPair', async () => {
        const { poolAdmin, pool, usdt, eth, fundingRate } = testEnv;
        const token = await deployMockToken('Test', 'Test', 18);
        const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['WBTC'];

        const pair = btcPair.pair;
        pair.indexToken = token.address;
        pair.stableToken = usdt.address;
        const tradingConfig = btcPair.tradingConfig;
        const tradingFeeConfig = btcPair.tradingFeeConfig;
        const fundingFeeConfig = btcPair.fundingFeeConfig;

        await expect(pool.connect(poolAdmin.signer).addPair(pair.stableToken, pair.indexToken)).to.be.revertedWith(
            '!st',
        );

        await expect(pool.addPair(eth.address, usdt.address)).to.be.revertedWith('ex');
        const countBefore = await pool.pairsIndex();
        await pool.addStableToken(usdt.address);
        await waitForTx(await pool.connect(poolAdmin.signer).addPair(pair.indexToken, pair.stableToken));

        let pairIndex = await pool.getPairIndex(pair.indexToken, pair.stableToken);
        await waitForTx(await pool.connect(poolAdmin.signer).updatePair(pairIndex, pair));
        await waitForTx(await pool.connect(poolAdmin.signer).updateTradingConfig(pairIndex, tradingConfig));
        await waitForTx(await pool.connect(poolAdmin.signer).updateTradingFeeConfig(pairIndex, tradingFeeConfig));
        await waitForTx(
            await fundingRate.connect(poolAdmin.signer).updateFundingFeeConfig(pairIndex, fundingFeeConfig),
        );

        const countAfter = await pool.pairsIndex();
        expect(countAfter).to.be.eq(countBefore.add(1));
    });

    it('check pair info', async () => {
        const { pool, fundingRate, btc, usdt } = testEnv;

        const pairIndex = 1;

        expect(await pool.pairs(pairIndex)).deep.be.eq(await pool.getPair(pairIndex));
        expect(await pool.tradingConfigs(pairIndex)).deep.be.eq(await pool.getTradingConfig(pairIndex));
        expect(await pool.tradingFeeConfigs(pairIndex)).deep.be.eq(await pool.getTradingFeeConfig(pairIndex));
        expect(await fundingRate.fundingFeeConfigs(pairIndex)).deep.be.eq(
            await fundingRate.fundingFeeConfigs(pairIndex),
        );

        const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['WBTC'];
        const pair = await pool.getPair(pairIndex);
        expect(pair.indexToken).to.be.eq(btc.address);
        expect(pair.stableToken).to.be.eq(usdt.address);
        expect(pair.enable).to.be.eq(btcPair.pair.enable);
    });

    describe('test updatePair', async () => {
        it('unHandler updatePair should be reverted', async () => {
            const {
                pool,
                users: [unHandler],
            } = testEnv;

            const pairIndex = 1;
            const pair = await pool.getPair(pairIndex);
            await expect(pool.connect(unHandler.signer).updatePair(pairIndex, pair)).to.be.revertedWith(
                'onlyPoolAdmin',
            );
        });

        it('check update pair', async () => {
            const { deployer, pool } = testEnv;

            const pairIndex = 1;
            const pairBefore = await pool.getPair(pairIndex);

            // updatePair
            let pairToUpdate: IPool.PairStructOutput = { ...pairBefore };
            pairToUpdate.enable = !pairBefore.enable;
            pairToUpdate.kOfSwap = BigNumber.from(99999999);
            pairToUpdate.expectIndexTokenP = BigNumber.from(4000);
            await waitForTx(await pool.connect(deployer.signer).updatePair(pairIndex, pairToUpdate));

            const pairAfterObj = await pool.getPair(pairIndex);
            let pairAfter: IPool.PairStructOutput = { ...pairAfterObj };

            expect(pairAfter.enable).to.be.eq(pairToUpdate.enable);
            expect(pairAfter.kOfSwap).to.be.eq(pairToUpdate.kOfSwap);
            pairToUpdate.expectIndexTokenP = BigNumber.from(5000);

            pairToUpdate.enable = true;
            await waitForTx(await pool.connect(deployer.signer).updatePair(pairIndex, pairToUpdate));
        });
    });
});
