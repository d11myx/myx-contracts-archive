import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';

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
        const { positionManager } = testEnv;

        const long = await positionManager.getTradingFee(pairIndex, true, ethers.utils.parseEther('100'));
        expect(long).to.be.eq('3200000000000000000000');

        const short = await positionManager.getTradingFee(pairIndex, false, ethers.utils.parseEther('100'));
        expect(short).to.be.eq('2000000000000000000000');
    });
});
