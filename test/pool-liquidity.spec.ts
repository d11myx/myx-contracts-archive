import { testEnv } from './helpers/make-suite';
import { waitForTx } from '../helpers';
import { getTestCallBack, getToken, MAX_UINT_AMOUNT } from '../helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('Pool: Liquidity cases', () => {
    const pairIndex = 0;

    it('user added liquidity, should be received lp', async () => {
        const {
            pool,
            btc,
            usdt,
            users: [, depositor],
        } = testEnv;

        const btcCallBack = await getTestCallBack('BTC');

        const pairTokenAddress = (await pool.getPair(pairIndex)).pairToken;
        const pairToken = await getToken(pairTokenAddress);

        await waitForTx(await usdt.connect(depositor.signer).approve(btcCallBack.address, MAX_UINT_AMOUNT));
        await waitForTx(await btc.connect(depositor.signer).approve(btcCallBack.address, MAX_UINT_AMOUNT));

        const usdtBalanceBef = await usdt.balanceOf(depositor.address);
        const btcBalanceBef = await btc.balanceOf(depositor.address);
        const depositorLpBef = await pairToken.balanceOf(depositor.address);
        const callbackLpBef = await pairToken.balanceOf(btcCallBack.address);

        await waitForTx(
            await btcCallBack
                .connect(depositor.signer)
                .addLiquidity(
                    pool.address,
                    pairIndex,
                    ethers.utils.parseEther('1000'),
                    ethers.utils.parseEther('30000000'),
                ),
        );

        const usdtBalanceAft = await usdt.balanceOf(depositor.address);
        const btcBalanceAft = await btc.balanceOf(depositor.address);
        const depositorLpAft = await pairToken.balanceOf(depositor.address);
        const callbackLpAft = await pairToken.balanceOf(btcCallBack.address);

        expect(usdtBalanceAft).to.be.eq(usdtBalanceBef.sub(ethers.utils.parseEther('30000000')));
        expect(btcBalanceAft).to.be.eq(btcBalanceBef.sub(ethers.utils.parseEther('1000')));
        expect(depositorLpAft).to.be.eq(depositorLpBef.add(ethers.utils.parseEther('59400000')));
        expect(callbackLpAft).to.be.eq(callbackLpBef);
    });
});
