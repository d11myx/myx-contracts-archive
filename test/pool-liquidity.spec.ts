import { newTestEnv, TestEnv, testEnv } from './helpers/make-suite';
import { waitForTx } from '../helpers';
import { getToken, MAX_UINT_AMOUNT } from '../helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { mintAndApprove } from './helpers/misc';

describe('Pool: Liquidity cases', () => {
    const pairIndex = 1;
    // let testEnv: TestEnv;

    it('user added liquidity, should be received lp', async () => {
        // testEnv = await newTestEnv();
        const {
            pool,
            btc,
            usdt,
            router,
            users: [, depositor],
        } = testEnv;

        const pair = await pool.getPair(pairIndex);

        const pairTokenAddress = pair.pairToken;
        const pairToken = await getToken(pairTokenAddress);

        // await waitForTx(await usdt.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT));
        // await waitForTx(await btc.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT));
        await mintAndApprove(testEnv, btc, ethers.utils.parseEther('1000'), depositor, router.address);
        await mintAndApprove(testEnv, usdt, ethers.utils.parseEther('30000000'), depositor, router.address);

        const usdtBalanceBef = await usdt.balanceOf(depositor.address);
        const btcBalanceBef = await btc.balanceOf(depositor.address);
        const depositorLpBef = await pairToken.balanceOf(depositor.address);
        const callbackLpBef = await pairToken.balanceOf(router.address);

        const receivedLP = await pool.getMintLpAmount(
            pairIndex,
            ethers.utils.parseEther('1000'),
            ethers.utils.parseEther('30000000'),
        );

        await waitForTx(
            await router
                .connect(depositor.signer)
                .addLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    ethers.utils.parseEther('1000'),
                    ethers.utils.parseEther('30000000'),
                ),
        );

        const usdtBalanceAft = await usdt.balanceOf(depositor.address);
        const btcBalanceAft = await btc.balanceOf(depositor.address);
        const depositorLpAft = await pairToken.balanceOf(depositor.address);
        const callbackLpAft = await pairToken.balanceOf(router.address);

        expect(usdtBalanceAft).to.be.eq(usdtBalanceBef.sub(ethers.utils.parseEther('30000000')));
        expect(btcBalanceAft).to.be.eq(btcBalanceBef.sub(ethers.utils.parseEther('1000')));
        expect(depositorLpAft).to.be.eq(depositorLpBef.add(receivedLP.mintAmount));
        expect(callbackLpAft).to.be.eq(callbackLpBef);
    });

    it('user added liquidity for other, other should be received lp', async () => {});

    it('user remove liquidity', async () => {});
});
