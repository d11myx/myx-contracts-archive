import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';

describe('Trade: settlement pnl', () => {
    const pairIndex = 1;
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

    it('user has profits, lp stable total should be decreased', async () => {
        const {
            users: [trader],
            usdt,
            router,
            pool,
            positionManager,
        } = testEnv;

        let btcPrice = '30000';
        await updateBTCPrice(testEnv, btcPrice);

        const collateral = ethers.utils.parseUnits('30000', 18);
        const size = ethers.utils.parseUnits('10', 18);
        const openPrice = ethers.utils.parseUnits('30000', 30);
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

        const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        const openPositionFee = collateral.sub(userPosition.collateral);

        btcPrice = '40000';
        await updateBTCPrice(testEnv, btcPrice);

        const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount);
        const userBalanceBefore = await usdt.balanceOf(trader.address);

        expect(userPnl).to.be.gt(0);

        const lpVaultBefore = await pool.getVault(pairIndex);
        const lpBalanceBefore = lpVaultBefore.stableTotalAmount;

        const { executeReceipt } = await decreasePosition(
            testEnv,
            trader,
            pairIndex,
            BigNumber.from(0),
            userPosition.positionAmount,
            TradeType.MARKET,
            true,
            ethers.utils.parseUnits(btcPrice, 30),
        );
        const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
        const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');
        const userBalanceAfter = await usdt.balanceOf(trader.address);

        const lpVaultAfter = await pool.getVault(pairIndex);
        const lpBalanceAfter = lpVaultAfter.stableTotalAmount;

        expect(userPnl).to.be.eq(BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount));
        expect(userBalanceAfter).to.be.eq(
            userBalanceBefore.add(userPnl).add(collateral).sub(openPositionFee).sub(tradingFee).sub(fundingFee),
        );

        const lpReceivedFee = BigNumber.from(tradingFee).mul(30).div(100);
        expect(lpBalanceAfter).to.be.eq(lpBalanceBefore.sub(userPnl).add(lpReceivedFee));
    });

    it('user has loss, lp stable total should be increased', async () => {
        const {
            users: [trader],
            usdt,
            router,
            pool,
            positionManager,
        } = testEnv;

        let btcPrice = '30000';
        await updateBTCPrice(testEnv, btcPrice);

        const collateral = ethers.utils.parseUnits('30000', 18);
        const size = ethers.utils.parseUnits('10', 18);
        const openPrice = ethers.utils.parseUnits('30000', 30);
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

        const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        const openPositionFee = collateral.sub(userPosition.collateral);

        btcPrice = '28000';
        await updateBTCPrice(testEnv, btcPrice);

        const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount);
        const userBalanceBefore = await usdt.balanceOf(trader.address);

        expect(userPnl).to.be.lt(0);

        const lpVaultBefore = await pool.getVault(pairIndex);
        const lpBalanceBefore = lpVaultBefore.stableTotalAmount;

        const { executeReceipt } = await decreasePosition(
            testEnv,
            trader,
            pairIndex,
            BigNumber.from(0),
            userPosition.positionAmount,
            TradeType.MARKET,
            true,
            ethers.utils.parseUnits(btcPrice, 30),
        );
        const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
        const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');
        const userBalanceAfter = await usdt.balanceOf(trader.address);

        const lpVaultAfter = await pool.getVault(pairIndex);
        const lpBalanceAfter = lpVaultAfter.stableTotalAmount;

        expect(userPnl).to.be.eq(BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount));
        expect(userBalanceAfter).to.be.eq(
            userBalanceBefore.add(userPnl).add(collateral).sub(openPositionFee).sub(tradingFee).sub(fundingFee),
        );

        const lpReceivedFee = BigNumber.from(tradingFee).mul(30).div(100);
        expect(lpBalanceAfter).to.be.eq(lpBalanceBefore.add(userPnl.abs()).add(lpReceivedFee));
    });
});
