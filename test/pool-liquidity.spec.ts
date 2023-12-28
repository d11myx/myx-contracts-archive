import { newTestEnv, TestEnv, testEnv } from './helpers/make-suite';
import { waitForTx } from '../helpers';
import { getToken, MAX_UINT_AMOUNT } from '../helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { mintAndApprove } from './helpers/misc';
import { parseUnits } from 'ethers/lib/utils';

describe('Pool: Liquidity cases', () => {
    const pairIndex = 1;
    // let testEnv: TestEnv;

    it('user added liquidity, should be received lp', async () => {
        // testEnv = await newTestEnv();
        const {
            pool,
            poolView,
            btc,
            usdt,
            router,
            oraclePriceFeed,
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

        const receivedLP = await poolView.getMintLpAmount(
            pairIndex,
            ethers.utils.parseUnits('1000', await btc.decimals()),
            ethers.utils.parseUnits('30000000', await usdt.decimals()),
            await oraclePriceFeed.getPrice(btc.address),
        );

        await waitForTx(
            await router
                .connect(depositor.signer)
                .addLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    ethers.utils.parseUnits('1000', await btc.decimals()),
                    ethers.utils.parseUnits('30000000', await usdt.decimals()),
                    [btc.address],
                    [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                    { value: 1 },
                ),
        );

        const usdtBalanceAft = await usdt.balanceOf(depositor.address);
        const btcBalanceAft = await btc.balanceOf(depositor.address);
        const depositorLpAft = await pairToken.balanceOf(depositor.address);
        const callbackLpAft = await pairToken.balanceOf(router.address);

        expect(usdtBalanceAft).to.be.eq(usdtBalanceBef.sub(ethers.utils.parseUnits('30000000', await usdt.decimals())));
        expect(btcBalanceAft).to.be.eq(btcBalanceBef.sub(ethers.utils.parseUnits('1000', await btc.decimals())));
        expect(depositorLpAft).to.be.eq(depositorLpBef.add(receivedLP.mintAmount));
        expect(callbackLpAft).to.be.eq(callbackLpBef);
    });

    it('user added liquidity for other, other should be received lp', async () => {});

    it('user remove liquidity', async () => {});
});
