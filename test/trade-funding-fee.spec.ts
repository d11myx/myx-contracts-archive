import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { Duration, increase, TradeType, getFundingRateInTs, convertIndexAmountToStable } from '../helpers';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';
import { PERCENTAGE, PRICE_PRECISION } from './helpers/constants';
import usdt from '../markets/usdt';

describe('Trade: funding fee', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('validate function', async () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('30000', await btc.decimals());
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('calculation funding rate', async () => {
            const { positionManager, pool, oraclePriceFeed, fundingRate, btc, usdt, router } = testEnv;

            // long = short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker);

            // init funding fee
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // update funding rate rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding rate
            let fundingFeeRate = BigNumber.from('0');
            const price = await oraclePriceFeed.getPrice(btc.address);
            const fundingFeeConfig = await fundingRate.fundingFeeConfigs(pairIndex);
            const { indexTotalAmount, indexReservedAmount, stableTotalAmount, stableReservedAmount } =
                await pool.getVault(pairIndex);

            const indexReservedToStable = (await convertIndexAmountToStable(btc, usdt, indexReservedAmount))
                .mul(price)
                .div('1000000000000000000000000000000');
            const u = stableTotalAmount.sub(stableReservedAmount).add(indexReservedToStable);
            const v = (await convertIndexAmountToStable(btc, usdt, indexTotalAmount.sub(indexReservedAmount)))
                .mul(price)
                .div('1000000000000000000000000000000')
                .add(stableReservedAmount);
            const k = fundingFeeConfig.growthRate;
            const r = fundingFeeConfig.baseRate;
            const maxRate = fundingFeeConfig.maxRate;
            const fundingInterval = fundingFeeConfig.fundingInterval;

            // S = ABS(2*R-1)=ABS(U-V)/(U+V)
            let s = u.sub(v).mul(PERCENTAGE).div(u.add(v));

            // G1 = MIN((S+S*S/2) * k + r, r(max))
            const min = s.mul(s).div(2).div(PERCENTAGE).add(s).mul(k).div(PERCENTAGE).add(r);
            const g1 = min.lt(maxRate) ? min : maxRate;
            fundingFeeRate = g1.div(86400 / fundingInterval.toNumber());
            const currentFundingRate = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeRate).to.be.eq(currentFundingRate);
        });

        it('calculation global funding fee tracker', async () => {
            const { positionManager, oraclePriceFeed, btc } = testEnv;

            const price = await oraclePriceFeed.getPrice(btc.address);
            const globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRate = await positionManager.getCurrentFundingRate(pairIndex);
            const fundingFeeTracker = fundingRate.mul(price).div(PRICE_PRECISION);

            expect(fundingFeeTracker).to.be.eq(globalFundingFeeTracker);
        });

        it('calculation position funding fee tracker', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const btcDecimals = await btc.decimals();
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', btcDecimals);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const globalFundingFeeTrackeBefore = await positionManager.globalFundingFeeTracker(pairIndex);

            // increase long position record funding fee
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionBefore.fundingFeeTracker).to.be.eq(globalFundingFeeTrackeBefore);

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            const globalFundingFeeTrackeAfter = await positionManager.globalFundingFeeTracker(pairIndex);

            // decrease short position
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                positionBefore.positionAmount,
                TradeType.MARKET,
                true,
            );

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.fundingFeeTracker).to.be.eq(globalFundingFeeTrackeAfter);
        });
    });

    describe('long > short', async () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('shorter user closed position, should be received funding fee', async () => {
            const {
                users: [longTrader, shortTrader],
                usdt,
                btc,
                router,
                positionManager,
                feeCollector,
            } = testEnv;

            const btcDecimals = await btc.decimals();
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', btcDecimals);
            const size2 = ethers.utils.parseUnits('10', btcDecimals);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // long = short
            const longTrackerBefore = await positionManager.longTracker(pairIndex);
            const shortTrackerBefore = await positionManager.shortTracker(pairIndex);

            expect(longTrackerBefore).to.be.eq(shortTrackerBefore);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            await increasePosition(testEnv, longTrader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            await increasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                collateral,
                openPrice,
                size2,
                TradeType.MARKET,
                false,
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            // long > short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.gt(shortTrackerAfter);

            let fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            let fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding rate rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(
                fundingFeeTrackerBefore.add(fundingRateAfter.mul(openPrice).div(PRICE_PRECISION)),
            );

            // funding fee tracker diff > 0, calculation funding fee
            const diffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortPosition.fundingFeeTracker);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const fundingFee = indexToStableAmount.mul(diffFundingFeeTracker).div(PERCENTAGE);

            // decrease short position
            await decreasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                BigNumber.from(0),
                shortPosition.positionAmount,
                TradeType.MARKET,
                false,
            );

            // exposure position > 0, calculation trading fee
            const indexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                shortPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingFee = indexDeltaToStableDelta.mul(tradingFeeConfig.makerFee).div(PERCENTAGE);
            const shortBalanceAfter = await usdt.balanceOf(shortTrader.address);

            // shorter user will be received funding fee
            expect(shortPosition.collateral.sub(tradingFee).add(fundingFee)).to.be.eq(shortBalanceAfter);
        });

        it('longer user closed position, should be paid funding fee', async () => {
            const {
                users: [longTrader],
                usdt,
                btc,
                positionManager,
                feeCollector,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('30000', 30);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            // long > short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.gt(shortTrackerAfter);

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(fundingRateAfter.mul(openPrice).div(PRICE_PRECISION));

            // funding fee tracker diff > 0, calculation funding fee
            const diffFundingFeeTracker = fundingFeeTrackerAfter.sub(longPosition.fundingFeeTracker);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
            const fundingFee = indexToStableAmount.mul(diffFundingFeeTracker.abs()).div(PERCENTAGE).mul(-1);

            // decrease long position
            await decreasePosition(
                testEnv,
                longTrader,
                pairIndex,
                BigNumber.from(0),
                longPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            // exposure position > 0, calculation trading fee
            const indexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                longPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingFee = indexDeltaToStableDelta.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            // longer user will be paid funding fee
            expect(longPosition.collateral.sub(tradingFee).sub(fundingFee.abs())).to.be.eq(longBalanceAfter);
        });
    });

    describe('short > long', async () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('longer user closed position, should be received funding fee', async () => {
            const {
                users: [longTrader, shortTrader],
                usdt,
                btc,
                router,
                positionManager,
                feeCollector,
            } = testEnv;

            const btcDecimals = await btc.decimals();
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', btcDecimals);
            const size2 = ethers.utils.parseUnits('30', btcDecimals);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const longTrackerBefore = await positionManager.longTracker(pairIndex);
            const shortTrackerBefore = await positionManager.shortTracker(pairIndex);

            // long = short
            expect(longTrackerBefore).to.be.eq(shortTrackerBefore);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            await increasePosition(testEnv, longTrader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            let shortBalanceBefore = await usdt.balanceOf(shortTrader.address);
            expect(shortBalanceBefore).to.be.eq(collateral);

            await increasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                collateral,
                openPrice,
                size2,
                TradeType.MARKET,
                false,
            );

            // long < short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.lt(shortTrackerAfter);

            let fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            let fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(
                fundingFeeTrackerBefore.add(fundingRateAfter.mul(openPrice).div(PRICE_PRECISION)),
            );

            // funding fee tracker diff < 0, calculation funding fee
            const diffFundingFeeTracker = fundingFeeTrackerAfter.sub(longPosition.fundingFeeTracker);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
            // const fundingFee = indexToStableAmount.mul(diffFundingFeeTracker.abs()).div(PERCENTAGE);
            const fundingFee = await positionManager.getFundingFee(
                longPosition.account,
                longPosition.pairIndex,
                longPosition.isLong,
            );

            // decrease short position
            await decreasePosition(
                testEnv,
                longTrader,
                pairIndex,
                BigNumber.from(0),
                longPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            // exposure position < 0, calculation trading fee
            const indexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                longPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            // const tradingFee = indexDeltaToStableDelta.mul(tradingFeeConfig.makerFee).div(PERCENTAGE);
            const tradingFee = await positionManager.getTradingFee(
                longPosition.pairIndex,
                longPosition.isLong,
                longPosition.positionAmount,
                openPrice,
            );
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            // longer user will be received funding fee
            expect(longPosition.collateral.sub(tradingFee).add(fundingFee)).to.be.eq(longBalanceAfter);
        });

        it('shorter user closed position, should be paid funding fee', async () => {
            const {
                users: [, shortTrader],
                usdt,
                btc,
                positionManager,
                feeCollector,
                fundingRate,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('30000', 30);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            // long < short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);
            expect(longTrackerAfter).to.be.lt(shortTrackerAfter);

            // calculation funding fee rate
            const fundingFeeConfig = await fundingRate.fundingFeeConfigs(pairIndex);
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const targetFundingRate = await getFundingRateInTs(testEnv, pairIndex);

            expect(targetFundingRate).to.be.eq(targetFundingRate);
            expect(fundingFeeTrackerAfter).to.be.eq(fundingRateAfter.mul(openPrice).div(PRICE_PRECISION));

            // funding fee tracker diff < 0, calculation funding fee
            const diffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortPosition.fundingFeeTracker);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            // const fundingFee = indexToStableAmount.mul(diffFundingFeeTracker.abs()).div(PERCENTAGE).mul(-1);
            const fundingFee = await positionManager.getFundingFee(
                shortPosition.account,
                shortPosition.pairIndex,
                shortPosition.isLong,
            );
            const tradingFee = await positionManager.getTradingFee(
                shortPosition.pairIndex,
                shortPosition.isLong,
                shortPosition.positionAmount,
                openPrice,
            );
            // decrease short position
            await decreasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                BigNumber.from(0),
                shortPosition.positionAmount,
                TradeType.MARKET,
                false,
            );

            // exposure position < 0, calculation trading fee
            const indexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                shortPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            // const tradingFee = indexDeltaToStableDelta.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);

            const shortBalanceAfter = await usdt.balanceOf(shortTrader.address);

            // shorter user will be paid funding fee
            expect(shortPosition.collateral.sub(tradingFee).add(fundingFee)).to.be.eq(shortBalanceAfter);
        });
    });

    describe('short = long', async () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('basic interest rate in long short equilibrium', async () => {
            const {
                users: [longTrader, shortTrader],
                usdt,
                btc,
                router,
                positionManager,
                feeCollector,
            } = testEnv;

            const btcDecimals = await btc.decimals();
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', btcDecimals);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // long = short
            const longTrackerBefore = await positionManager.longTracker(pairIndex);
            const shortTrackerBefore = await positionManager.shortTracker(pairIndex);

            expect(longTrackerBefore).to.be.eq(shortTrackerBefore);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            await increasePosition(testEnv, longTrader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            await increasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                collateral,
                openPrice,
                size,
                TradeType.MARKET,
                false,
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            // long < short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.eq(shortTrackerAfter);

            let fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            let fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerAfter).to.be.eq(
                fundingFeeTrackerBefore.add(fundingRateAfter.mul(openPrice).div(PRICE_PRECISION)),
            );

            // funding fee tracker diff > 0, calculation funding fee
            const longDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longPosition.fundingFeeTracker);
            const shortDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortPosition.fundingFeeTracker);
            const longIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
            const shortIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const longFundingFee = longIndexToStableAmount.mul(longDiffFundingFeeTracker).div(PERCENTAGE).mul(-1);
            const shortFundingFee = shortIndexToStableAmount.mul(shortDiffFundingFeeTracker).div(PERCENTAGE);

            // decrease long position
            await decreasePosition(
                testEnv,
                longTrader,
                pairIndex,
                BigNumber.from(0),
                longPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            // exposure position = 0, calculation trading fee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const longIndexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                longPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const longTradingFee = longIndexDeltaToStableDelta.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            // decrease short position
            await decreasePosition(
                testEnv,
                shortTrader,
                pairIndex,
                BigNumber.from(0),
                shortPosition.positionAmount,
                TradeType.MARKET,
                false,
            );

            // exposure position < 0, calculation trading fee
            const shortIndexDeltaToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                shortPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const shortTradingFee = shortIndexDeltaToStableDelta.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);
            const shortBalanceAfter = await usdt.balanceOf(shortTrader.address);

            // longer user paid fundind fee to shorter user
            expect(longPosition.collateral.sub(longTradingFee).sub(longFundingFee.abs())).to.be.eq(longBalanceAfter);
            expect(shortPosition.collateral.sub(shortTradingFee).add(shortFundingFee)).to.be.eq(shortBalanceAfter);
        });
    });

    describe('rate simulation (can only add position)', async () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('epoch 0, 30000 price', async () => {
            const { positionManager, router, btc } = testEnv;

            const openPrice = ethers.utils.parseUnits('30000', 30);

            // tracker = 0
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '30000');

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq('0');
            expect(fundingRateAfter).to.be.eq('0');
            expect(epochFundingFee).to.be.eq('0');
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

            // long = short
            const longTrackerBefore = await positionManager.longTracker(pairIndex);
            const shortTrackerBefore = await positionManager.shortTracker(pairIndex);

            expect(longTrackerBefore).to.be.eq(shortTrackerBefore);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, longFirst, router.address);
            await increasePosition(testEnv, longFirst, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);

            await mintAndApprove(testEnv, usdt, collateral, longSecond, router.address);
            await increasePosition(testEnv, longSecond, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);

            // increase short position
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
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);

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
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(fundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingRateAfter).to.be.gt(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(fundingFeeTrackerBefore.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPosition.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPosition.positionAmount,
            );
            const longFirstFundingFee = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longSecondPosition.fundingFeeTracker);
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPosition.positionAmount,
            );
            const longSecondFundingFee = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortFirstPosition.fundingFeeTracker);
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortFirstPosition.positionAmount,
            );
            const shortFirstFundingFee = shortFirstIndexToStableAmount
                .mul(shortFirstDiffFundingFeeTracker)
                .div(PERCENTAGE);

            const shortSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortSecondPosition.fundingFeeTracker);
            const shortSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortSecondPosition.positionAmount,
            );
            const shortSecondFundingFee = shortSecondDiffFundingFeeTracker
                .mul(shortSecondIndexToStableAmount)
                .div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

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
                router,
            } = testEnv;
            const openPrice = ethers.utils.parseUnits('35000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // position before
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            // funding fee before
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

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('35000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            // expect(fundingRateAfter).to.be.eq(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(fundingFeeTrackerBefore.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee after */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPosition.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPosition.positionAmount,
            );
            const longFirstFundingFeeAfter = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longSecondPosition.fundingFeeTracker);
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPosition.positionAmount,
            );
            const longSecondFundingFeeAfter = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortFirstPosition.fundingFeeTracker);
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortFirstPosition.positionAmount,
            );
            const shortFirstFundingFeeAfter = shortFirstIndexToStableAmount
                .mul(shortFirstDiffFundingFeeTracker)
                .div(PERCENTAGE);

            const shortSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortSecondPosition.fundingFeeTracker);
            const shortSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortSecondPosition.positionAmount,
            );
            const shortSecondFundingFeeAfter = shortSecondIndexToStableAmount
                .mul(shortSecondDiffFundingFeeTracker)
                .div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(
                shortFirstFundingFeeAfter
                    .sub(shortFirstFundingFeeBefore)
                    .add(shortSecondFundingFeeAfter.sub(shortSecondFundingFeeBefore))
                    .add(lpFundingFee)
                    .abs(),
            );
        });

        it('epoch 3, 25000 price unchanged position', async () => {
            const {
                users: [longFirst, longSecond, shortFirst, shortSecond],
                positionManager,
                usdt,
                btc,
                router,
            } = testEnv;
            const openPrice = ethers.utils.parseUnits('25000', 30);

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // position before
            const longFirstPosition = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPosition = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPosition = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPosition = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            // funding fee before
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

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('25000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq(fundingFeeTrackerBefore.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee after */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPosition.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPosition.positionAmount,
            );
            const longFirstFundingFeeAfter = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longSecondPosition.fundingFeeTracker);
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPosition.positionAmount,
            );
            const longSecondFundingFeeAfter = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortFirstPosition.fundingFeeTracker);
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortFirstPosition.positionAmount,
            );
            const shortFirstFundingFeeAfter = shortFirstIndexToStableAmount
                .mul(shortFirstDiffFundingFeeTracker)
                .div(PERCENTAGE);

            const shortSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortSecondPosition.fundingFeeTracker);
            const shortSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortSecondPosition.positionAmount,
            );
            const shortSecondFundingFeeAfter = shortSecondIndexToStableAmount
                .mul(shortSecondDiffFundingFeeTracker)
                .div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

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
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const openPrice = ethers.utils.parseUnits('22000', 30);
            const longFirstSize = ethers.utils.parseUnits('21', await btc.decimals());
            const longSecondSize = ethers.utils.parseUnits('20', await btc.decimals());
            const shortFirstSize = ethers.utils.parseUnits('22', await btc.decimals());
            const shortSecondSize = ethers.utils.parseUnits('20', await btc.decimals());

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // position before
            const longFirstPositionBefore = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPositionBefore = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPositionBefore = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPositionBefore = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '22000');

            // increase long position
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
            const longFirstBalanceAfter = await usdt.balanceOf(longFirst.address);

            expect(longFirstBalanceAfter).to.be.eq('0');
            expect(longFirstPositionAfter.positionAmount).to.be.eq(
                longFirstPositionBefore.positionAmount.add(longFirstSize),
            );
            expect(longFirstPositionAfter.averagePrice).to.be.eq(
                longFirstPositionBefore.averagePrice
                    .mul(longFirstPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(longFirstSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(longFirstPositionBefore.positionAmount.add(longFirstSize)),
            );

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
            const longSecondBalanceAfter = await usdt.balanceOf(longSecond.address);

            expect(longSecondBalanceAfter).to.be.eq('0');
            expect(longSecondPositionAfter.positionAmount).to.be.eq(
                longSecondPositionBefore.positionAmount.add(longSecondSize),
            );
            expect(longSecondPositionAfter.averagePrice).to.be.eq(
                longSecondPositionBefore.averagePrice
                    .mul(longSecondPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(longSecondSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(longSecondPositionBefore.positionAmount.add(longSecondSize)),
            );

            // increase short position
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
            const shortFirstBalanceAfter = await usdt.balanceOf(shortFirst.address);

            expect(shortFirstBalanceAfter).to.be.eq('0');
            expect(shortFirstPositionAfter.positionAmount).to.be.eq(
                shortFirstPositionBefore.positionAmount.add(shortFirstSize),
            );
            expect(shortFirstPositionAfter.averagePrice).to.be.eq(
                shortFirstPositionBefore.averagePrice
                    .mul(shortFirstPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(shortFirstSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(shortFirstPositionBefore.positionAmount.add(shortFirstSize)),
            );

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
            const shortSecondBalanceAfter = await usdt.balanceOf(shortSecond.address);

            expect(shortSecondBalanceAfter).to.be.eq('0');
            expect(shortSecondPositionAfter.positionAmount).to.be.eq(
                shortSecondPositionBefore.positionAmount.add(shortSecondSize),
            );
            expect(shortSecondPositionAfter.averagePrice).to.be.eq(
                shortSecondPositionBefore.averagePrice
                    .mul(shortSecondPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(shortSecondSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(shortSecondPositionBefore.positionAmount.add(shortSecondSize)),
            );

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // update funding rate
            await increase(Duration.hours(1));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('22000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingRateAfter).to.be.gt(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(fundingFeeTrackerBefore.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPositionAfter.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPositionAfter.positionAmount,
            );
            const longFirstFundingFeeAfter = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                longSecondPositionAfter.fundingFeeTracker,
            );
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPositionAfter.positionAmount,
            );
            const longSecondFundingFee = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                shortFirstPositionAfter.fundingFeeTracker,
            );
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortFirstPositionAfter.positionAmount,
            );
            const shortFirstFundingFee = shortFirstIndexToStableAmount
                .mul(shortFirstDiffFundingFeeTracker)
                .div(PERCENTAGE);

            const shortSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                shortSecondPositionAfter.fundingFeeTracker,
            );
            const shortSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortSecondPositionAfter.positionAmount,
            );
            const shortSecondFundingFee = shortSecondIndexToStableAmount
                .mul(shortSecondDiffFundingFeeTracker)
                .div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(longFirstFundingFeeAfter.add(longSecondFundingFee).abs()).to.be.eq(
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

            const fundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // position before
            const longFirstPositionBefore = await positionManager.getPosition(longFirst.address, pairIndex, true);
            const longSecondPositionBefore = await positionManager.getPosition(longSecond.address, pairIndex, true);
            const shortFirstPositionBefore = await positionManager.getPosition(shortFirst.address, pairIndex, false);
            const shortSecondPositionBefore = await positionManager.getPosition(shortSecond.address, pairIndex, false);

            // funding fee before
            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);

            // update btc price
            await updateBTCPrice(testEnv, '30000');

            // increase short position
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

            expect(shortFirstPositionAfter.positionAmount).to.be.eq(shortFirstPositionBefore.positionAmount.add(size));
            expect(shortFirstPositionAfter.averagePrice).to.be.eq(
                shortFirstPositionBefore.averagePrice
                    .mul(shortFirstPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(size).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(shortFirstPositionBefore.positionAmount.add(size)),
            );

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

            expect(shortSecondPositionAfter.positionAmount).to.be.eq(
                shortSecondPositionBefore.positionAmount.add(size),
            );
            expect(shortSecondPositionAfter.averagePrice).to.be.eq(
                shortSecondPositionBefore.averagePrice
                    .mul(shortSecondPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(size).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(shortSecondPositionBefore.positionAmount.add(size)),
            );

            // long < short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.lt(shortTracker);

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingRateAfter).to.be.lt(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(fundingFeeTrackerBefore.add(epochFundingFee));

            /* funding fee tracker diff < 0, calculation position funding fee */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                longFirstPositionBefore.fundingFeeTracker,
            );
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPositionBefore.positionAmount,
            );
            const longFirstFundingFeeAfter = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                longSecondPositionBefore.fundingFeeTracker,
            );
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPositionBefore.positionAmount,
            );
            const longSecondFundingFeeAfter = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                shortFirstPositionAfter.fundingFeeTracker,
            );
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortFirstPositionAfter.positionAmount,
            );
            const shortFirstFundingFeeAfter = shortFirstIndexToStableAmount
                .mul(shortFirstDiffFundingFeeTracker)
                .div(PERCENTAGE);

            const shortSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                shortSecondPositionAfter.fundingFeeTracker,
            );
            const shortSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortSecondPositionAfter.positionAmount,
            );
            const shortSecondFundingFeeAfter = shortSecondIndexToStableAmount
                .mul(shortSecondDiffFundingFeeTracker)
                .div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = shortTracker.sub(longTracker).mul(-1);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE).abs();

            // expect(
            //     longFirstFundingFeeAfter
            //         .sub(longFirstFundingFeeBefore)
            //         .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
            //         .abs(),
            // ).to.be.eq(shortFirstFundingFeeAfter.add(shortSecondFundingFeeAfter).add(lpFundingFee).abs());
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
                oraclePriceFeed,
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('30000', await btc.decimals());
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('epoch 0, 25000 price', async () => {
            const { positionManager, router, btc } = testEnv;

            const openPrice = ethers.utils.parseUnits('25000', 30);

            // tracker = 0
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker).and.eq(0);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            const globalFundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(globalFundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update funding rate
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('25000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq('0');
            expect(fundingRateAfter).to.be.eq('0');
            expect(epochFundingFee).to.be.eq('0');
        });

        it('epoch 1, 25500 price', async () => {
            const { positionManager, btc, router } = testEnv;

            const openPrice = ethers.utils.parseUnits('25500', 30);

            // tracker = 0
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.eq(shortTracker);

            const globalFundingFeeTrackerBefore = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            expect(globalFundingFeeTrackerBefore).to.be.eq('0');
            expect(fundingRateBefore).to.be.eq('0');

            // update btc price
            await updateBTCPrice(testEnv, '25500');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('25500', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingRateAfter).to.be.lt(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(globalFundingFeeTrackerBefore.add(epochFundingFee));
        });

        it('epoch 2, 26000 price open position', async () => {
            const {
                users: [longFirst, longSecond, short],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const longFirstSize = ethers.utils.parseUnits('10', await btc.decimals());
            const longSecondSize = ethers.utils.parseUnits('15', await btc.decimals());
            const shortSize = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('26000', 30);

            // tracker = 0
            const longTrackerBefore = await positionManager.longTracker(pairIndex);
            const shortTrackerBefore = await positionManager.shortTracker(pairIndex);

            expect(longTrackerBefore).to.be.eq(shortTrackerBefore);

            // update btc price
            await updateBTCPrice(testEnv, '26000');

            // increase long position
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

            // increase short position
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

            const globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // long > short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.gt(shortTrackerAfter);

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('26000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq(globalFundingFeeTracker.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPosition.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPosition.positionAmount,
            );
            const longFirstFundingFee = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longSecondPosition.fundingFeeTracker);
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPosition.positionAmount,
            );
            const longSecondFundingFee = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortPosition.fundingFeeTracker);
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortPosition.positionAmount,
            );
            const shortFundingFee = shortFirstIndexToStableAmount.mul(shortDiffFundingFeeTracker).div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTrackerAfter.sub(shortTrackerAfter);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(
                shortFundingFee.add(lpFundingFee).abs(),
            );
        });

        it('epoch 3, 26500 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const longSize = ethers.utils.parseUnits('15', await btc.decimals());
            const shortSize = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('26500', 30);

            // update btc price
            await updateBTCPrice(testEnv, '26500');

            // increase long position
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

            expect(longFirstPositionAfter.positionAmount).to.be.eq(
                longFirstPositionBefore.positionAmount.add(longSize),
            );
            expect(longFirstPositionAfter.averagePrice).to.be.eq(
                longFirstPositionBefore.averagePrice
                    .mul(longFirstPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(longSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(longFirstPositionBefore.positionAmount.add(longSize)),
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

            expect(longSecondPositionAfter.positionAmount).to.be.eq(
                longSecondPositionBefore.positionAmount.add(longSize),
            );
            expect(longSecondPositionAfter.averagePrice).to.be.eq(
                longSecondPositionBefore.averagePrice
                    .mul(longSecondPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(longSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(longSecondPositionBefore.positionAmount.add(longSize)),
            );

            // open increase position
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

            expect(shortPositionAfter.positionAmount).to.be.eq(shortPositionBefore.positionAmount.add(shortSize));
            expect(shortPositionAfter.averagePrice).to.be.eq(
                shortPositionBefore.averagePrice
                    .mul(shortPositionBefore.positionAmount)
                    .div(PRICE_PRECISION)
                    .add(openPrice.mul(shortSize).div(PRICE_PRECISION))
                    .mul(PRICE_PRECISION)
                    .div(shortPositionBefore.positionAmount.add(shortSize)),
            );

            const globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // long > short
            const longTrackerAfter = await positionManager.longTracker(pairIndex);
            const shortTrackerAfter = await positionManager.shortTracker(pairIndex);

            expect(longTrackerAfter).to.be.gt(shortTrackerAfter);

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('26500', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingRateAfter).to.be.lt(fundingRateBefore);
            expect(fundingFeeTrackerAfter).to.be.eq(globalFundingFeeTracker.add(epochFundingFee));

            /* funding fee tracker diff > 0, calculation position funding fee */
            const longFirstDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(longFirstPositionAfter.fundingFeeTracker);
            const longFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longFirstPositionAfter.positionAmount,
            );
            const longFirstFundingFee = longFirstIndexToStableAmount
                .mul(longFirstDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const longSecondDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(
                longSecondPositionAfter.fundingFeeTracker,
            );
            const longSecondIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                longSecondPositionAfter.positionAmount,
            );
            const longSecondFundingFee = longSecondIndexToStableAmount
                .mul(longSecondDiffFundingFeeTracker)
                .div(PERCENTAGE)
                .mul(-1);

            const shortDiffFundingFeeTracker = fundingFeeTrackerAfter.sub(shortPositionAfter.fundingFeeTracker);
            const shortFirstIndexToStableAmount = await convertIndexAmountToStable(
                btc,
                usdt,
                shortPositionAfter.positionAmount,
            );
            const shortFundingFee = shortFirstIndexToStableAmount.mul(shortDiffFundingFeeTracker).div(PERCENTAGE);

            // calculation lp funding fee
            const exposedPositionAmount = longTrackerAfter.sub(shortTrackerAfter);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(longFirstFundingFee.add(longSecondFundingFee).abs()).to.be.eq(
                shortFundingFee.add(lpFundingFee).abs(),
            );
        });

        it('epoch 4, 25000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                positionManager,
                btc,
                usdt,
                router,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('25000', 30);

            const globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // funding fee before
            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeBefore = await positionManager.getFundingFee(short.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '25000');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('25000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq(globalFundingFeeTracker.add(epochFundingFee));

            // funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeAfter = await positionManager.getFundingFee(short.address, pairIndex, false);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(shortFundingFeeAfter.sub(shortFundingFeeBefore).add(lpFundingFee).abs());
        });

        it('epoch 5, 24000 price increase position', async () => {
            const {
                users: [longFirst, longSecond, short],
                positionManager,
                btc,
                usdt,
                router,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('24000', 30);

            const globalFundingFeeTracker = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateBefore = await positionManager.getCurrentFundingRate(pairIndex);

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // funding fee before
            const longFirstFundingFeeBefore = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeBefore = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeBefore = await positionManager.getFundingFee(short.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '24000');

            // update funding rate
            await increase(Duration.hours(8));
            await router.setPriceAndUpdateFundingRate(
                pairIndex,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('24000', 8)])],
                { value: 1 },
            );

            // calculation funding fee rate and tracker
            const fundingFeeTrackerAfter = await positionManager.globalFundingFeeTracker(pairIndex);
            const fundingRateAfter = await positionManager.getCurrentFundingRate(pairIndex);
            const epochFundingFee = fundingRateAfter.mul(openPrice).div(PRICE_PRECISION);

            expect(fundingFeeTrackerAfter).to.be.eq(globalFundingFeeTracker.add(epochFundingFee));

            // funding fee
            const longFirstFundingFeeAfter = await positionManager.getFundingFee(longFirst.address, pairIndex, true);
            const longSecondFundingFeeAfter = await positionManager.getFundingFee(longSecond.address, pairIndex, true);
            const shortFundingFeeAfter = await positionManager.getFundingFee(short.address, pairIndex, false);

            // calculation lp funding fee
            const exposedPositionAmount = longTracker.sub(shortTracker);
            const lpIndexToStableAmount = await convertIndexAmountToStable(btc, usdt, exposedPositionAmount);
            const lpFundingFee = lpIndexToStableAmount.mul(epochFundingFee).div(PERCENTAGE);

            expect(
                longFirstFundingFeeAfter
                    .sub(longFirstFundingFeeBefore)
                    .add(longSecondFundingFeeAfter.sub(longSecondFundingFeeBefore))
                    .abs(),
            ).to.be.eq(shortFundingFeeAfter.sub(shortFundingFeeBefore).add(lpFundingFee).abs());
        });
    });
});
