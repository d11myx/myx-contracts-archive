import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { expect } from './shared/expect';
import { getMockToken } from '../helpers';
import { BigNumber, constants } from 'ethers';
import Decimal from 'decimal.js';

describe('LP: fair price', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    it('buy mlp', async () => {
        const {
            users: [, trader],
            usdt,
            btc,
            router,
            pool,
        } = testEnv;

        const pair = await pool.getPair(pairIndex);
        const pairPrice = await pool.lpFairPrice(pairIndex);

        expect(pairPrice).to.be.eq(ethers.utils.parseUnits('1000000000000'));

        const buyLpAmount = ethers.utils.parseUnits('1000000', 18);
        const { depositIndexAmount, depositStableAmount } = await pool.getDepositAmount(pairIndex, buyLpAmount);

        const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, depositIndexAmount, depositStableAmount);
        const lpToken = await getMockToken('', pair.pairToken);
        const totoalApplyBefore = await lpToken.totalSupply();

        const vaultBefore = await pool.getVault(pairIndex);
        await mintAndApprove(testEnv, btc, depositIndexAmount, trader, router.address);
        await mintAndApprove(testEnv, usdt, depositStableAmount, trader, router.address);
        const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
        const userBtcBalanceBefore = await btc.balanceOf(trader.address);
        const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

        expect(userLpBalanceBefore).to.be.eq('0');
        expect(userBtcBalanceBefore).to.be.eq(depositIndexAmount);
        expect(userUsdtBalanceBefore).to.be.eq(depositStableAmount);

        await router
            .connect(trader.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, depositIndexAmount, depositStableAmount);
        const totoalApplyAfter = await lpToken.totalSupply();

        expect(totoalApplyAfter).to.be.eq(totoalApplyBefore.add(expectAddLiquidity.mintAmount));

        const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
        const userBtcBalanceAfter = await btc.balanceOf(trader.address);
        const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

        expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(depositIndexAmount));
        expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(depositStableAmount));
        expect(userLpBalanceAfter).to.be.eq(expectAddLiquidity.mintAmount);

        const vaultAfter = await pool.getVault(pairIndex);

        const totalFee = expectAddLiquidity.indexFeeAmount
            .mul(pairPrice)
            .add(expectAddLiquidity.stableFeeAmount)
            .add(expectAddLiquidity.slipAmount);
        const vaultTotalAfter = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
        const vaultTotalBefore = vaultBefore.indexTotalAmount.mul(pairPrice).add(vaultBefore.stableTotalAmount);
        const userPaid = depositIndexAmount.mul(pairPrice).add(depositStableAmount);
        const indexFeeAmount = depositIndexAmount.mul(pair.addLpFeeP).div(1e8);
        const stableFeeAmount = depositStableAmount.mul(pair.addLpFeeP).div(1e8);
        const totalFeeAmount = indexFeeAmount.add(stableFeeAmount);

        expect(
            expectAddLiquidity.afterFeeIndexAmount.add(expectAddLiquidity.afterFeeStableAmount).add(totalFeeAmount),
        ).to.be.eq(depositIndexAmount.add(depositStableAmount).sub(expectAddLiquidity.slipAmount));
        expect(userPaid.add(vaultTotalBefore)).to.be.eq(vaultTotalAfter.add(totalFee));
    });

    it('sell mlp', async () => {
        const {
            users: [, trader],
            usdt,
            btc,
            router,
            pool,
            priceOracle,
        } = testEnv;

        const lpPrice = await pool.lpFairPrice(pairIndex);
        const pairPrice = BigNumber.from(
            ethers.utils.formatUnits(await priceOracle.getOraclePrice(btc.address), 30).replace('.0', ''),
        );

        const pair = await pool.getPair(pairIndex);
        const lpToken = await getMockToken('', pair.pairToken);
        const vaultBefore = await pool.getVault(pairIndex);
        const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
        const sellLpAmount = userLpBalanceBefore;
        const userBtcBalanceBefore = await btc.balanceOf(trader.address);
        const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);
        const {
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            feeAmount,
            feeIndexTokenAmount,
            feeStableTokenAmount,
        } = await pool.getReceivedAmount(pairIndex, sellLpAmount);

        await lpToken.connect(trader.signer).approve(router.address, constants.MaxUint256);
        await router.connect(trader.signer).removeLiquidity(pair.indexToken, pair.stableToken, sellLpAmount);
        const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
        const userBtcBalanceAfter = await btc.balanceOf(trader.address);
        const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);
        const vaultAfter = await pool.getVault(pairIndex);

        expect(userLpBalanceAfter).to.be.eq(userLpBalanceBefore.sub(sellLpAmount));
        expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.add(receiveIndexTokenAmount));
        expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.add(receiveStableTokenAmount));

        const vaultTotal = receiveIndexTokenAmount.mul(pairPrice).add(receiveStableTokenAmount).add(feeAmount);
        const userPaid = sellLpAmount.mul(lpPrice).div('1000000000000000000000000000000');

        expect(new Decimal(ethers.utils.formatEther(userPaid)).toFixed(8)).to.be.eq(
            new Decimal(ethers.utils.formatEther(vaultTotal)).toFixed(8),
        );

        expect(vaultAfter.indexTotalAmount).to.be.eq(vaultBefore.indexTotalAmount.sub(receiveIndexTokenAmount));
        expect(vaultAfter.stableTotalAmount).to.be.eq(vaultBefore.stableTotalAmount.sub(receiveStableTokenAmount));
    });
});
