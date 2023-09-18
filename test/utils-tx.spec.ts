import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove } from './helpers/misc';
import { TradeType, getFundingRate, getFundingRateInTs } from '../helpers';
import { expect } from './shared/expect';

describe('Utils: tx', () => {
    describe('calculation funding rate', async () => {
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
            const indexAmount = ethers.utils.parseUnits('30000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('getFundingRate', async () => {
            const {
                users: [longFirst, shortFirst],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('300000', 18);
            const size = ethers.utils.parseUnits('4', 18);
            const size2 = ethers.utils.parseUnits('2', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            let longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);

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
            let shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(openPrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('4000000000000000000');
            expect(shortTracker).to.be.eq('2000000000000000000');

            const nextFundingRate = await positionManager.getNextFundingRate(pairIndex);
            const fundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(nextFundingRate).to.be.eq(fundingRate);
        });
    });
});
