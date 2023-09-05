import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { Duration, increase, TradeType } from '../helpers';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';

describe('Trade: funding fee', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor, maker],
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

        // make positions
        const collateral = ethers.utils.parseUnits('3000000', 18);
        const size = ethers.utils.parseUnits('90', 18);
        let openPrice = ethers.utils.parseUnits('30000', 30);

        await mintAndApprove(testEnv, usdt, collateral, maker, router.address);
        await increasePosition(testEnv, maker, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

        const collateral2 = ethers.utils.parseUnits('3000000', 18);
        const size2 = ethers.utils.parseUnits('30', 18);
        let openPrice2 = ethers.utils.parseUnits('30000', 30);

        await mintAndApprove(testEnv, usdt, collateral2, maker, router.address);
        await increasePosition(testEnv, maker, pairIndex, collateral2, openPrice2, size2, TradeType.MARKET, false);
    });

    describe('longTracker > shortTracker', async () => {
        before(async () => {
            const { positionManager } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);
        });

        it('longer user closed position, should be paid fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('9', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPositionBefore.positionAmount).to.be.eq(size);

            await positionManager.updateFundingRate(pairIndex);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerBefore).to.be.eq('0');

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);

            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerAfter).to.be.eq('16046490000');

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPositionBefore.positionAmount,
                TradeType.MARKET,
                true,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);

            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPositionBefore.collateral;
            const tradingFee = await positionManager.getTradingFee(pairIndex, true, userPositionBefore.positionAmount);

            // longer user will be paid fundingFee
            expect(positionCollateral.sub(balanceDiff).sub(tradingFee)).to.be.eq(userFundingFee);
        });

        it('shorter user closed position, should be received fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('9', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPositionBefore.positionAmount).to.be.eq(size);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerBefore).to.be.eq('16046490000');

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);

            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerAfter).to.be.eq('27906930000');

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPositionBefore.positionAmount,
                TradeType.MARKET,
                false,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);

            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPositionBefore.collateral;
            const tradingFee = await positionManager.getTradingFee(pairIndex, false, userPositionBefore.positionAmount);

            // shorter user will be received fundingFee
            expect(balanceDiff.sub(positionCollateral).add(tradingFee)).to.be.eq(userFundingFee);
        });
    });

    describe('shortTracker > longTracker', async () => {
        before(async () => {
            const {
                users: [, maker],
                usdt,
                router,
                positionManager
            } = testEnv;

            // make positions
            const collateral = ethers.utils.parseUnits('3000000', 18);
            const size = ethers.utils.parseUnits('90', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, maker, router.address);
            await increasePosition(testEnv, maker, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.lt(shortTracker);
        });

        it('longer user closed position, should be received fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('9', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerBefore).to.be.eq('27906930000');

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPositionBefore.positionAmount).to.be.eq(size);

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerAfter).to.be.eq('25030230000');

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPositionBefore.positionAmount,
                TradeType.MARKET,
                true,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPositionBefore.collateral;
            const tradingFee = await positionManager.getTradingFee(pairIndex, true, userPositionBefore.positionAmount);

            // longer user will be received fundingFee
            expect(balanceDiff.sub(positionCollateral).add(tradingFee)).to.be.eq(userFundingFee);
        });

        it('shorter user closed position, should be paid fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('1', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerBefore).to.be.eq('25030230000');

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPositionBefore.positionAmount).to.be.eq(size);

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);

            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerAfter).to.be.eq('20622660000');

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPositionBefore.positionAmount,
                TradeType.MARKET,
                false,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPositionBefore.collateral;
            const tradingFee = await positionManager.getTradingFee(pairIndex, false, userPositionBefore.positionAmount);

            // shorter user will be paid fundingFee
            expect(positionCollateral.sub(balanceDiff).sub(tradingFee)).to.be.eq(userFundingFee);
        });
    });

    describe('longTracker = shortTracker', async () => { });
});
