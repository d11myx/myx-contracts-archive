import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { updateBTCPrice, increasePosition, mintAndApprove } from './helpers/misc';
import { Duration, increase, TradeType } from '../helpers';
import { expect } from './shared/expect';

describe('Trade: funding fee epoch', () => {

    describe('rate simulation (can only add position)', async () => {
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
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(openPrice);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(testEnv, shortFirst, pairIndex, collateral, openPrice, size2, TradeType.MARKET, false);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);

            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(openPrice);

            await mintAndApprove(testEnv, usdt, collateral, shortSecond, router.address);
            await increasePosition(testEnv, shortSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(openPrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('8000000000000000000');
            expect(shortTracker).to.be.eq('6000000000000000000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            //TODO: short position funding fee needs to be less than 0
            expect(longFirstFundingFee).to.be.gt(0);
            expect(longSecondFundingFee).to.be.gt(0);
            expect(shortFirstFundingFee).to.be.lt(0);
            expect(shortSecondFundingFee).to.be.lt(0);
        });

        it('epoch 2, 35000 price unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
            } = testEnv;

            const size = ethers.utils.parseUnits('4', 18);
            const size2 = ethers.utils.parseUnits('2', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);
            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(openPrice);
            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(openPrice);
            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(openPrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('8000000000000000000');
            expect(shortTracker).to.be.eq('6000000000000000000');

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            //TODO: short position funding fee needs to be less than 0
            expect(longFirstFundingFee).to.be.gt(0);
            expect(longSecondFundingFee).to.be.gt(0);
            expect(shortFirstFundingFee).to.be.lt(0);
            expect(shortSecondFundingFee).to.be.lt(0);
        });

        it('epoch 3, 25000 price unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
            } = testEnv;

            const size = ethers.utils.parseUnits('4', 18);
            const size2 = ethers.utils.parseUnits('2', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(longFirstPosition.positionAmount).to.be.eq(size);
            expect(longFirstPosition.averagePrice).to.be.eq(openPrice);
            expect(longSecondPosition.positionAmount).to.be.eq(size);
            expect(longSecondPosition.averagePrice).to.be.eq(openPrice);
            expect(shortFirstPosition.positionAmount).to.be.eq(size2);
            expect(shortFirstPosition.averagePrice).to.be.eq(openPrice);
            expect(shortSecondPosition.positionAmount).to.be.eq(size);
            expect(shortSecondPosition.averagePrice).to.be.eq(openPrice);

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('8000000000000000000');
            expect(shortTracker).to.be.eq('6000000000000000000');

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            //TODO: short position funding fee needs to be less than 0
            expect(longFirstFundingFee).to.be.gt(0);
            expect(longSecondFundingFee).to.be.gt(0);
            expect(shortFirstFundingFee).to.be.lt(0);
            expect(shortSecondFundingFee).to.be.lt(0);
        });

        it('epoch 4, 22000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                router,
                usdt,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', 18);
            const openPrice = ethers.utils.parseUnits('22000', 30);
            const longFirstSize = ethers.utils.parseUnits('21', 18);
            const longSecondSize = ethers.utils.parseUnits('20', 18);
            const shortFirstSize = ethers.utils.parseUnits('22', 18);
            const shortSecondSize = ethers.utils.parseUnits('20', 18);

            // update btc price
            await updateBTCPrice(testEnv, '22000');

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, longFirstSize, TradeType.MARKET, true);
            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, longSecondSize, TradeType.MARKET, true);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(testEnv, shortFirst, pairIndex, collateral, openPrice, shortFirstSize, TradeType.MARKET, false);
            await mintAndApprove(testEnv, usdt, collateral, shortSecond, router.address);
            await increasePosition(testEnv, shortSecond, pairIndex, collateral, openPrice, shortSecondSize, TradeType.MARKET, false);

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(longFirstPosition.positionAmount).to.be.eq("25000000000000000000");
            expect(longFirstPosition.averagePrice).to.be.eq('23280000000000000000000000000000000');
            expect(longSecondPosition.positionAmount).to.be.eq("24000000000000000000");
            expect(longSecondPosition.averagePrice).to.be.eq('23333333333333333333333333333333333');
            expect(shortFirstPosition.positionAmount).to.be.eq("24000000000000000000");
            expect(shortFirstPosition.averagePrice).to.be.eq('22666666666666666666666666666666666');
            expect(shortSecondPosition.positionAmount).to.be.eq("24000000000000000000");
            expect(shortSecondPosition.averagePrice).to.be.eq('23333333333333333333333333333333333');

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('49000000000000000000');
            expect(shortTracker).to.be.eq('48000000000000000000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            //TODO: short position funding fee needs to be less than 0
            expect(longFirstFundingFee).to.be.gt(0);
            expect(longSecondFundingFee).to.be.gt(0);
            expect(shortFirstFundingFee).to.be.lt(0);
            expect(shortSecondFundingFee).to.be.lt(0);
        });

        it('epoch 5, 30000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                router,
                usdt,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const size = ethers.utils.parseUnits('2', 18);

            // update btc price
            await updateBTCPrice(testEnv, '30000');

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, shortFirst, router.address);
            await increasePosition(testEnv, shortFirst, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);
            await mintAndApprove(testEnv, usdt, collateral, shortSecond, router.address);
            await increasePosition(testEnv, shortSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            // lp long position
            const exposedPosition = await positionManager.getExposedPositions(pairIndex);
            expect(exposedPosition.abs()).to.be.eq("3000000000000000000");

            // user position size and price
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            expect(longFirstPosition.positionAmount).to.be.eq("25000000000000000000");
            expect(longFirstPosition.averagePrice).to.be.eq('23280000000000000000000000000000000');
            expect(longSecondPosition.positionAmount).to.be.eq("24000000000000000000");
            expect(longSecondPosition.averagePrice).to.be.eq('23333333333333333333333333333333333');
            expect(shortFirstPosition.positionAmount).to.be.eq("26000000000000000000");
            expect(shortFirstPosition.averagePrice).to.be.eq('23230769230769230769230730769230769');
            expect(shortSecondPosition.positionAmount).to.be.eq("26000000000000000000");
            expect(shortSecondPosition.averagePrice).to.be.eq('23846153846153846153846115384615384');

            // user total position
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq('49000000000000000000');
            expect(shortTracker).to.be.eq('52000000000000000000');

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);

            // user position funding fee
            const longFirstFundingFee = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFee = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFirstFundingFee = await positionManager.getFundingFee(shortFirst.address, pairIndex, false);
            const shortSecondFundingFee = await positionManager.getFundingFee(shortSecond.address, pairIndex, false);

            //TODO: short position funding fee needs to be greater than 0
            expect(longFirstFundingFee).to.be.lt(0);
            expect(longSecondFundingFee).to.be.lt(0);
            expect(shortFirstFundingFee).to.be.gt(0);
            expect(shortSecondFundingFee).to.be.gt(0);
        });
    });

    describe('calculate whether different prices will achieve balance', async () => {
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
                router,
                positionManager,
            } = testEnv;

            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '26000');

            const collateral = ethers.utils.parseUnits('300000', 18);
            const longFirstSize = ethers.utils.parseUnits('10', 18);
            const longSecondSize = ethers.utils.parseUnits('15', 18);
            const shortSize = ethers.utils.parseUnits('20', 18);
            const openPrice = ethers.utils.parseUnits('26000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, longFirstSize, TradeType.MARKET, true);
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            // console.log("longFirstPosition: ", longFirstPosition);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, longSecondSize, TradeType.MARKET, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            // console.log("longSecondPosition: ", longSecondPosition);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, short, router.address);
            await increasePosition(testEnv, short, pairIndex, collateral, openPrice, shortSize, TradeType.MARKET, true);
            const shortPosition = await positionManager.getPosition(short.address, pairIndex, true);
            // console.log("shortPosition: ", shortPosition);

            // update funding fee
            await increase(Duration.hours(8));
            await positionManager.updateFundingRate(pairIndex);
        });
    });
});
