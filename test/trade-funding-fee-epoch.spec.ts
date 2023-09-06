import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { updateBTCPrice, increasePosition, mintAndApprove } from './helpers/misc';
import { Duration, increase, TradeType } from '../helpers';
import { expect } from './shared/expect';

describe('Trade: funding fee epoch', () => {
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

    describe('rate simulation', async () => {
        before(async () => {
            const { positionManager } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);
        });

        it('epoch 1, 30000 open position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('4', 18);
            const size2 = ethers.utils.parseUnits('2', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longFirstPositionBefore = await positionManager.getPosition(longFirst.address, pairIndex, true);
            expect(longFirstPositionBefore.positionAmount).to.be.eq(size);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longSecondPositionBefore = await positionManager.getPosition(longSecond.address, pairIndex, true);
            expect(longSecondPositionBefore.positionAmount).to.be.eq(size);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(
                testEnv,
                shortFirst,
                pairIndex,
                collateral,
                openPrice,
                size2,
                TradeType.MARKET,
                false,
            );
            const shortFirstPositionBefore = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            expect(shortFirstPositionBefore.positionAmount).to.be.eq(size2);

            await mintAndApprove(testEnv, usdt, collateral, shortSecond, router.address);
            await increasePosition(
                testEnv,
                shortSecond,
                pairIndex,
                collateral,
                openPrice,
                size,
                TradeType.MARKET,
                false,
            );
            const shortSecondPositionBefore = await positionManager.getPosition(shortSecond.address, pairIndex, false);
            expect(shortSecondPositionBefore.positionAmount).to.be.eq(size);

            await positionManager.updateFundingRate(pairIndex);
            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerBefore).to.be.eq('0');

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);

            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(fundingFeeTrackerAfter).to.be.eq('4285710000');

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            expect(longFirstFundingFee).to.be.eq(longSecondFundingFee).and.eq('-171428400000000000000');

            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            expect(shortFirstFundingFee).to.be.eq('85714200000000000000');

            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);
            expect(shortSecondFundingFee).to.be.eq('171428400000000000000');
        });

        it('epoch 2, 35000 unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            // update funding fee
            await increase(Duration.hours(10));
            await positionManager.updateFundingRate(pairIndex);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            expect(longFirstFundingFee).to.be.eq(longSecondFundingFee).and.eq('-371428200000000000000');

            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            expect(shortFirstFundingFee).to.be.eq('185714100000000000000');

            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);
            expect(shortSecondFundingFee).to.be.eq('371428200000000000000');
        });

        it('epoch 3, 25000 unchanged position', async () => {});
    });
});
