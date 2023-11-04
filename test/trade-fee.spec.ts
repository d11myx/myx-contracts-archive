import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { getPositionTradingFee } from '../helpers';

describe('Trade: FeeCal', () => {
    const pairIndex = 1;
    // before('add liquidity', async () => {
    //     testEnv = await newTestEnv();
    //     const {
    //         users: [depositor],
    //         usdt,
    //         btc,
    //         pool,
    //         router,
    //     } = testEnv;
    //
    //     // add liquidity
    //     const indexAmount = ethers.utils.parseUnits('10', 18);
    //     const stableAmount = ethers.utils.parseUnits('300000', 18);
    //     const pair = await pool.getPair(pairIndex);
    //     await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
    //     await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
    //
    //     await router
    //         .connect(depositor.signer)
    //         .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    // });

    it('calculate trading fee', async () => {
        const { positionManager, btc, usdt, oraclePriceFeed } = testEnv;

        const long = await positionManager.getTradingFee(
            pairIndex,
            true,
            ethers.utils.parseUnits('100', await btc.decimals()),
            await oraclePriceFeed.getPrice(btc.address),
        );

        let positionTradingFee = await getPositionTradingFee(
            testEnv,
            pairIndex,
            btc,
            usdt,

            ethers.utils.parseUnits('100', await btc.decimals()),
            true,
        );
        expect(long).to.be.eq(positionTradingFee);

        const short = await positionManager.getTradingFee(
            pairIndex,
            false,
            ethers.utils.parseUnits('100', await btc.decimals()),
            await oraclePriceFeed.getPrice(btc.address),
        );
        positionTradingFee = await getPositionTradingFee(
            testEnv,
            pairIndex,
            btc,
            usdt,
            ethers.utils.parseUnits('100', await btc.decimals()),
            false,
        );
        expect(short).to.be.eq(positionTradingFee);
    });
});
