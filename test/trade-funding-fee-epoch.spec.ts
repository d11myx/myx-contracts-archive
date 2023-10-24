import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { updateBTCPrice, increasePosition, mintAndApprove } from './helpers/misc';
import {
    Duration,
    increase,
    TradeType,
    getAveragePrice,
    getFundingFeeTracker,
    getEpochFundingFee,
    getPositionFundingFee,
    getLpFundingFee,
    getFundingRateInTs,
} from '../helpers';
import { expect } from './shared/expect';

describe('Trade: funding fee epoch', () => {
    describe('rate simulation (can only add position)', async () => {
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
            const indexAmount = ethers.utils.parseUnits('30000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('epoch 0, init', async () => {
            const { positionManager } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '30000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);
        });

        it('epoch 1, 30000 price open position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const size = ethers.utils.parseUnits('4', await btc.decimals());
            const size2 = ethers.utils.parseUnits('2', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            let longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            let longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(openPrice);

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
            let shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(openPrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('800000000');
            expect(shortTracker).to.be.eq('600000000');

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            expect(globalFundingFeeTracker).to.be.eq(0);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            let longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            let longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            let shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            let shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,

                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,

                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortFirstPosition.fundingFeeTracker,
                    shortFirstPosition.positionAmount,
                    false,
                ),
            );
            expect(shortSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortSecondPosition.fundingFeeTracker,
                    shortSecondPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(
                shortFirstFundingFee.add(shortSecondFundingFee).add(lpFundingFee),
            );
        });

        it('epoch 2, 35000 price unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
                usdt,
                btc,
            } = testEnv;

            const size = ethers.utils.parseUnits('4', await btc.decimals());
            const size2 = ethers.utils.parseUnits('2', await btc.decimals());
            const averagePrice = ethers.utils.parseUnits('30000', 30);
            const openPrice = ethers.utils.parseUnits('35000', 30);

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFeeBefore = await positionManager.getFundingFee(
                shortFirst.address,
                pairIndex,
                false,
            );
            const shortSecondFundingFeeBefore = await positionManager.getFundingFee(
                shortSecond.address,
                pairIndex,
                false,
            );

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(averagePrice);

            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(averagePrice);

            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(averagePrice);

            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(averagePrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('800000000');
            expect(shortTracker).to.be.eq('600000000');

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFeeAfter = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFeeAfter = await positionManager.getFundingFee(
                shortSecond.address,
                pairIndex,
                false,
            );
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,
                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortFirstPosition.fundingFeeTracker,
                    shortFirstPosition.positionAmount,
                    false,
                ),
            );
            expect(shortSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortSecondPosition.fundingFeeTracker,
                    shortSecondPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(
                shortFirstFundingFeeAfter
                    .sub(shortFirstFundingFeeBefore)
                    .add(shortSecondFundingFeeAfter.sub(shortSecondFundingFeeBefore))
                    .add(lpFundingFee),
            );
        });

        it('epoch 3, 25000 price unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
                usdt,
                btc,
            } = testEnv;

            const size = ethers.utils.parseUnits('4', await btc.decimals());
            const size2 = ethers.utils.parseUnits('2', await btc.decimals());
            const averagePrice = ethers.utils.parseUnits('30000', 30);
            const openPrice = ethers.utils.parseUnits('25000', 30);

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFeeBefore = await positionManager.getFundingFee(
                shortFirst.address,
                pairIndex,
                false,
            );
            const shortSecondFundingFeeBefore = await positionManager.getFundingFee(
                shortSecond.address,
                pairIndex,
                false,
            );

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(averagePrice);

            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(averagePrice);

            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(averagePrice);

            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(averagePrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('800000000');
            expect(shortTracker).to.be.eq('600000000');

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFeeAfter = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFeeAfter = await positionManager.getFundingFee(
                shortSecond.address,
                pairIndex,
                false,
            );
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,
                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortFirstPosition.fundingFeeTracker,
                    shortFirstPosition.positionAmount,
                    false,
                ),
            );
            expect(shortSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortSecondPosition.fundingFeeTracker,
                    shortSecondPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(
                shortFirstFundingFeeAfter
                    .sub(shortFirstFundingFeeBefore)
                    .add(shortSecondFundingFeeAfter.sub(shortSecondFundingFeeBefore))
                    .add(lpFundingFee),
            );
        });

        it('epoch 4, 22000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                router,
                usdt,
                btc,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const openPrice = ethers.utils.parseUnits('22000', 30);
            const longFirstSize = ethers.utils.parseUnits('21', await btc.decimals());
            const longSecondSize = ethers.utils.parseUnits('20', await btc.decimals());
            const shortFirstSize = ethers.utils.parseUnits('22', await btc.decimals());
            const shortSecondSize = ethers.utils.parseUnits('20', await btc.decimals());

            // update btc price
            await updateBTCPrice(testEnv, '22000');

            // open long position
            const longFirstPositionBefore = await positionManager.getPosition(longFirst.address, pairIndex, true);
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(
                testEnv,
                longFirst,
                pairIndex,
                collateral,
                openPrice,
                longFirstSize,
                TradeType.MARKET,
                true,
            );
            const longFirstPositionAfter = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPositionAfter.positionAmount).to.be.eq('2500000000');
            expect(longFirstPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    longFirstPositionBefore.averagePrice,
                    longFirstPositionBefore.positionAmount,
                    openPrice,
                    longFirstSize,
                ),
            );

            const longSecondPositionBefore = await positionManager.getPosition(longSecond.address, pairIndex, true);
            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(
                testEnv,
                longSecond,
                pairIndex,
                collateral,
                openPrice,
                longSecondSize,
                TradeType.MARKET,
                true,
            );
            const longSecondPositionAfter = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPositionAfter.positionAmount).to.be.eq('2400000000');
            expect(longSecondPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    longSecondPositionBefore.averagePrice,
                    longSecondPositionBefore.positionAmount,
                    openPrice,
                    longSecondSize,
                ),
            );

            // open short position
            const shortFirstPositionBefore = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(
                testEnv,
                shortFirst,
                pairIndex,
                collateral,
                openPrice,
                shortFirstSize,
                TradeType.MARKET,
                false,
            );
            const shortFirstPositionAfter = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPositionAfter.positionAmount).to.be.eq('24000000000000000000');
            expect(shortFirstPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    shortFirstPositionBefore.averagePrice,
                    shortFirstPositionBefore.positionAmount,
                    openPrice,
                    shortFirstSize,
                ),
            );

            const shortSecondPositionBefore = await positionManager.getPosition(shortSecond.address, pairIndex, false);
            await mintAndApprove(testEnv, usdt, collateral, shortSecond, router.address);
            await increasePosition(
                testEnv,
                shortSecond,
                pairIndex,
                collateral,
                openPrice,
                shortSecondSize,
                TradeType.MARKET,
                false,
            );
            const shortSecondPositionAfter = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPositionAfter.positionAmount).to.be.eq('24000000000000000000');
            expect(shortSecondPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    shortSecondPositionBefore.averagePrice,
                    shortSecondPositionBefore.positionAmount,
                    openPrice,
                    shortSecondSize,
                ),
            );

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('49000000000000000000');
            expect(shortTracker).to.be.eq('48000000000000000000');

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPositionAfter.fundingFeeTracker,
                    longFirstPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPositionAfter.fundingFeeTracker,
                    longSecondPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(shortFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortFirstPositionAfter.fundingFeeTracker,
                    shortFirstPositionAfter.positionAmount,
                    false,
                ),
            );
            expect(shortSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortSecondPositionAfter.fundingFeeTracker,
                    shortSecondPositionAfter.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(
                shortFirstFundingFee.add(shortSecondFundingFee).add(lpFundingFee),
            );
        });

        it('epoch 5, 30000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                router,
                usdt,
                btc,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const size = ethers.utils.parseUnits('2', await btc.decimals());

            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);

            // update btc price
            await updateBTCPrice(testEnv, '30000');

            // open short position
            const shortFirstPositionBefore = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(
                testEnv,
                shortFirst,
                pairIndex,
                collateral,
                openPrice,
                size,
                TradeType.MARKET,
                false,
            );
            const shortFirstPositionAfter = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPositionAfter.positionAmount).to.be.eq('400000000');
            expect(shortFirstPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    shortFirstPositionBefore.averagePrice,
                    shortFirstPositionBefore.positionAmount,
                    openPrice,
                    size,
                ),
            );

            const shortSecondPositionBefore = await positionManager.getPosition(shortSecond.address, pairIndex, false);
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
            const shortSecondPositionAfter = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPositionAfter.positionAmount).to.be.eq('600000000');
            expect(shortSecondPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    shortSecondPositionBefore.averagePrice,
                    shortSecondPositionBefore.positionAmount,
                    openPrice,
                    size,
                ),
            );

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('49000000000000000000');
            expect(shortTracker).to.be.eq('52000000000000000000');

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            const longFirstPositionAfter = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPositionAfter = await positionManager.getPosition(longSecond.address, pairIndex, true);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPositionAfter.fundingFeeTracker,
                    longFirstPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPositionAfter.fundingFeeTracker,
                    longSecondPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(shortFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortFirstPositionAfter.fundingFeeTracker,
                    shortFirstPositionAfter.positionAmount,
                    false,
                ),
            );
            expect(shortSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortSecondPositionAfter.fundingFeeTracker,
                    shortSecondPositionAfter.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            // expect(
            //     longFirstFundingFee
            //         .add(longFirstFundingFeeBefore)
            //         .add(longSecondFundingFee.add(longSecondFundingFeeBefore))
            //         .abs()
            //         .add(lpFundingFee),
            // ).to.be.eq(shortFirstFundingFee.add(shortSecondFundingFee));
        });
    });

    describe('calculate whether different prices will achieve balance', async () => {
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
            const indexAmount = ethers.utils.parseUnits('30000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('epoch 0, init', async () => {
            const { positionManager } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);
        });

        it('epoch 1, 25500 price', async () => {
            const { positionManager } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '25500');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);
        });

        it('epoch 2, 26000 price open position', async () => {
            const {
                users: [longFirst, longSecond, short],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '26000');

            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const longFirstSize = ethers.utils.parseUnits('10', await btc.decimals());
            const longSecondSize = ethers.utils.parseUnits('15', await btc.decimals());
            const shortSize = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('26000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(
                testEnv,
                longFirst,
                pairIndex,
                collateral,
                openPrice,
                longFirstSize,
                TradeType.MARKET,
                true,
            );
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(longFirstSize);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(
                testEnv,
                longSecond,
                pairIndex,
                collateral,
                openPrice,
                longSecondSize,
                TradeType.MARKET,
                true,
            );
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPosition.positionAmount).to.be.eq(longSecondSize);
            expect(longSecondPosition.averagePrice).to.be.eq(openPrice);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, short, router.address);
            await increasePosition(
                testEnv,
                short,
                pairIndex,
                collateral,
                openPrice,
                shortSize,
                TradeType.MARKET,
                false,
            );
            const shortPosition = await positionManager.getPosition(short.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(shortSize);
            expect(shortPosition.averagePrice).to.be.eq(openPrice);

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFee = await positionManager.getFundingFee(short.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,
                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortPosition.fundingFeeTracker,
                    shortPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(shortFundingFee.add(lpFundingFee));
        });

        it('epoch 3, 26500 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '26500');

            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const longSize = ethers.utils.parseUnits('15', await btc.decimals());
            const shortSize = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('26500', 30);

            // open long position
            const longFirstPositionBefore = await positionManager.getPosition(longFirst.address, pairIndex, true);
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(
                testEnv,
                longFirst,
                pairIndex,
                collateral,
                openPrice,
                longSize,
                TradeType.MARKET,
                true,
            );
            const longFirstPositionAfter = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPositionAfter.positionAmount).to.be.eq('2500000000');
            expect(longFirstPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    longFirstPositionBefore.averagePrice,
                    longFirstPositionBefore.positionAmount,
                    openPrice,
                    longSize,
                ),
            );

            const longSecondPositionBefore = await positionManager.getPosition(longSecond.address, pairIndex, true);
            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(
                testEnv,
                longSecond,
                pairIndex,
                collateral,
                openPrice,
                longSize,
                TradeType.MARKET,
                true,
            );
            const longSecondPositionAfter = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPositionAfter.positionAmount).to.be.eq('3000000000');
            expect(longSecondPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    longSecondPositionBefore.averagePrice,
                    longSecondPositionBefore.positionAmount,
                    openPrice,
                    longSize,
                ),
            );

            // open short position
            const shortPositionBefore = await positionManager.getPosition(short.address, pairIndex, false);
            await mintAndApprove(testEnv, usdt, collateral, short, router.address);
            await increasePosition(
                testEnv,
                short,
                pairIndex,
                collateral,
                openPrice,
                shortSize,
                TradeType.MARKET,
                false,
            );
            const shortPositionAfter = await positionManager.getPosition(short.address, pairIndex, false);

            expect(shortPositionAfter.positionAmount).to.be.eq('40000000000000000000');
            expect(shortPositionAfter.averagePrice).to.be.eq(
                getAveragePrice(
                    shortPositionBefore.averagePrice,
                    shortPositionBefore.positionAmount,
                    openPrice,
                    shortSize,
                ),
            );

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFee = await positionManager.getFundingFee(short.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPositionAfter.fundingFeeTracker,
                    longFirstPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPositionAfter.fundingFeeTracker,
                    longSecondPositionAfter.positionAmount,
                    true,
                ),
            );
            expect(shortFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortPositionAfter.fundingFeeTracker,
                    shortPositionAfter.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(shortFundingFee.add(lpFundingFee));
        });

        it('epoch 4, 25000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                positionManager,
                btc,
                usdt,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('25000', 30);

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeBefore = await positionManager.getFundingFee(short.address, pairIndex, false);

            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortPosition = await positionManager.getPosition(short.address, pairIndex, false);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeAfter = await positionManager.getFundingFee(short.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,
                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortPosition.fundingFeeTracker,
                    shortPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(shortFundingFeeAfter.sub(shortFundingFeeBefore).add(lpFundingFee));
        });

        it('epoch 5, 24000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                positionManager,
                btc,
                usdt,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('24000', 30);

            let globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            // update btc price
            await updateBTCPrice(testEnv, '24000');

            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortPosition = await positionManager.getPosition(short.address, pairIndex, false);

            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeBefore = await positionManager.getFundingFee(short.address, pairIndex, false);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                globalFundingFeeTracker,
                currentFundingRate,
                openPrice,
            );
            globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(globalFundingFeeTracker).to.be.eq(targetFundingFeeTracker);

            // funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeAfter = await positionManager.getFundingFee(short.address, pairIndex, false);
            const epochFundindFee = getEpochFundingFee(currentFundingRate, openPrice);

            expect(longFirstFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longFirstPosition.fundingFeeTracker,
                    longFirstPosition.positionAmount,
                    true,
                ),
            );
            expect(longSecondFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    longSecondPosition.fundingFeeTracker,
                    longSecondPosition.positionAmount,
                    true,
                ),
            );
            expect(shortFundingFeeAfter).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    globalFundingFeeTracker,
                    shortPosition.fundingFeeTracker,
                    shortPosition.positionAmount,
                    false,
                ),
            );

            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            const lpFundingFee = getLpFundingFee(epochFundindFee, exposedPosition);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(shortFundingFeeAfter.sub(shortFundingFeeBefore).add(lpFundingFee));
        });
    });
});
