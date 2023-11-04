import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import {
    Duration,
    increase,
    TradeType,
    getFundingRateInTs,
    getFundingFeeTracker,
    getPositionFundingFee,
    getPositionTradingFee,
} from '../helpers';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';
import { it } from 'mocha';

describe('Trade: funding fee', () => {
    const pairIndex = 1;
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
        const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

        // make positions
        const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
        const size = ethers.utils.parseUnits('90', await btc.decimals());
        let openPrice = ethers.utils.parseUnits('30000', 30);

        await mintAndApprove(testEnv, usdt, collateral, maker, router.address);
        await increasePosition(testEnv, maker, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

        const collateral2 = ethers.utils.parseUnits('3000000', await usdt.decimals());
        const size2 = ethers.utils.parseUnits('30', await btc.decimals());
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
                btc,
                router,
                positionManager,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            let userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);

            expect(userPosition.positionAmount).to.be.eq(size);

            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                fundingFeeTrackerBefore,
                currentFundingRate,
                openPrice,
            );
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);

            console.log('usdt decimals:' + (await usdt.decimals()));
            console.log('fundingFeeTrackerAfter:' + fundingFeeTrackerAfter);
            console.log('userPosition.fundingFeeTracker:' + userPosition.fundingFeeTracker);
            console.log('userPosition.positionAmount:' + userPosition.positionAmount);
            const expectFundinFee = await getPositionFundingFee(
                testEnv,
                pairIndex,
                btc,
                usdt,
                fundingFeeTrackerAfter,
                userPosition.fundingFeeTracker,
                userPosition.positionAmount,
                true,
            );
            expect(userFundingFee).to.be.eq(expectFundinFee);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;
            const tradingFee = await positionManager.getTradingFee(
                pairIndex,
                true,
                userPosition.positionAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                btc,
                usdt,
                userPosition.positionAmount,
                true,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            // longer user will be paid fundingFee
            userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('positionCollateral:' + positionCollateral);
            console.log('balanceDiff:' + balanceDiff);
            console.log('tradingFee:' + tradingFee);
            console.log('userFundingFee:' + userFundingFee);

            expect(positionCollateral.sub(balanceDiff).sub(tradingFee)).to.be.eq(userFundingFee.abs());
        });

        it('shorter user closed position, should be received fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const userUsdtBefore = await usdt.balanceOf(trader.address);

            expect(userPosition.positionAmount).to.be.eq(size);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                fundingFeeTrackerBefore,
                currentFundingRate,
                openPrice,
            );
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

            expect(userFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    fundingFeeTrackerAfter,
                    userPosition.fundingFeeTracker,
                    userPosition.positionAmount,
                    false,
                ),
            );

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                false,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);

            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;
            const tradingFee = await positionManager.getTradingFee(
                pairIndex,
                false,
                userPosition.positionAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                btc,
                usdt,
                userPosition.positionAmount,
                false,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            // shorter user will be received fundingFee
            // todo
            expect(balanceDiff.sub(positionCollateral).add(tradingFee)).to.be.eq(userFundingFee);
        });
    });

    describe('shortTracker > longTracker', async () => {
        before(async () => {
            const {
                users: [, maker],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            // make positions
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('90', await btc.decimals());
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
                btc,
                router,
                positionManager,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPosition.positionAmount).to.be.eq(size);

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                fundingFeeTrackerBefore,
                currentFundingRate,
                openPrice,
            );
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);

            expect(userFundingFee).to.be.eq(
                await getPositionFundingFee(
                    testEnv,
                    pairIndex,
                    btc,
                    usdt,
                    fundingFeeTrackerAfter,
                    userPosition.fundingFeeTracker,
                    userPosition.positionAmount,
                    true,
                ),
            );

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;
            const tradingFee = await positionManager.getTradingFee(
                pairIndex,
                true,
                userPosition.positionAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                btc,
                usdt,
                userPosition.positionAmount,
                true,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            // longer user will be received fundingFee
            expect(balanceDiff.sub(positionCollateral).add(tradingFee)).to.be.eq(userFundingFee);
        });

        it('shorter user closed position, should be paid fundingFee', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('1', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            expect(userPosition.positionAmount).to.be.eq(size);

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // funding rate
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(currentFundingRate).to.be.eq(targetFundingRate);

            // funding fee tracker
            const targetFundingFeeTracker = getFundingFeeTracker(
                fundingFeeTrackerBefore,
                currentFundingRate,
                openPrice,
            );
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(targetFundingFeeTracker);

            // user position funding fee
            const userFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                false,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;
            const tradingFee = await positionManager.getTradingFee(
                pairIndex,
                false,
                userPosition.positionAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                btc,
                usdt,
                userPosition.positionAmount,
                false,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            // shorter user will be paid fundingFee
            expect(positionCollateral.sub(balanceDiff).sub(tradingFee).abs()).to.be.eq(userFundingFee.abs());
        });
    });

    describe('longTracker = shortTracker', async () => {});

    describe('long and short should be balanced', async () => {
        it('long = short', async () => {
            const {
                users: [trader, user1],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, user1, router.address);
            await increasePosition(
                testEnv,
                user1,
                pairIndex,
                collateral,
                openPrice,
                ethers.utils.parseUnits('30', await btc.decimals()),
                TradeType.MARKET,
                true,
            );

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            expect(await positionManager.getExposedPositions(pairIndex)).to.be.eq(0);

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            const longFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);
            const shortFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

            expect(longFundingFee).to.be.lt(0);
            expect(shortFundingFee).to.be.gt(0);

            expect(longFundingFee.abs()).to.be.eq(shortFundingFee.abs());
        });

        it('long > short', async () => {
            const {
                users: [trader, user1],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, user1, router.address);
            await increasePosition(
                testEnv,
                user1,
                pairIndex,
                collateral,
                openPrice,
                ethers.utils.parseUnits('30', await btc.decimals()),
                TradeType.MARKET,
                true,
            );

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            expect(await positionManager.getExposedPositions(pairIndex)).to.be.gt(0);

            // update funding fee
            await increase(Duration.hours(10));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            const longFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);
            const shortFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

            expect(longFundingFee).to.be.lt(0);
            expect(shortFundingFee).to.be.gt(0);

            expect(longFundingFee.abs()).to.be.eq(shortFundingFee.abs());
        });

        it('long < short', async () => {
            it('long > short', async () => {
                const {
                    users: [trader, user1],
                    usdt,
                    btc,
                    router,
                    positionManager,
                } = testEnv;
                console.log(await positionManager.getExposedPositions(pairIndex));

                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('9', await btc.decimals());
                let openPrice = ethers.utils.parseUnits('30000', 30);

                await mintAndApprove(testEnv, usdt, collateral, user1, router.address);
                await increasePosition(
                    testEnv,
                    user1,
                    pairIndex,
                    collateral,
                    openPrice,
                    ethers.utils.parseUnits('30', await btc.decimals()),
                    TradeType.MARKET,
                    false,
                );

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );

                expect(await positionManager.getExposedPositions(pairIndex)).to.be.lt(0);

                // update funding fee
                await increase(Duration.hours(10));
                await router.setPriceAndUpdateFundingRate(
                    pairIndex,
                    [btc.address],
                    [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                    { value: 1 },
                );

                const longFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, true);
                const shortFundingFee = await positionManager.getFundingFee(trader.address, pairIndex, false);

                expect(longFundingFee).to.be.gt(0);
                expect(shortFundingFee).to.be.lt(0);

                expect(longFundingFee.abs()).to.be.eq(shortFundingFee.abs());
            });
        });
    });
});
