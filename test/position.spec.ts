import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { mintAndApprove, increasePosition } from './helpers/misc';
import { TradeType } from '../helpers';

describe('Position', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;
    const collateral = ethers.utils.parseUnits('10000', 18);
    const price = ethers.utils.parseUnits('30000', 30);

    describe('Position: trade fee ', () => {
        describe('long > short', () => {
            before('add liquidity', async () => {
                testEnv = await newTestEnv();
                const {
                    users: [depositor, long, short],
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

                const collateral = ethers.utils.parseUnits('3000000', 18);
                const longSize = ethers.utils.parseUnits('90', 18);
                let openPrice = ethers.utils.parseUnits('30000', 30);

                await mintAndApprove(testEnv, usdt, collateral, long, router.address);
                await increasePosition(testEnv, long, pairIndex, collateral, openPrice, longSize, TradeType.MARKET, true);

                const shortSize = ethers.utils.parseUnits('30', 18);

                await mintAndApprove(testEnv, usdt, collateral, short, router.address);
                await increasePosition(testEnv, short, pairIndex, collateral, openPrice, shortSize, TradeType.MARKET, false);
            });

            describe('user open long position', () => {
                before(async () => {
                    const { positionManager } = testEnv;

                    const longTracker = await positionManager.longTracker(pairIndex);
                    const shortTracker = await positionManager.shortTracker(pairIndex);

                    expect(longTracker).to.be.gt(shortTracker);
                });

                it('user open long position, collect taker fee', async () => {
                    const {
                        users: [trader],
                        usdt,
                        router,
                        positionManager,
                    } = testEnv;
                    const size = ethers.utils.parseUnits('9', 18);

                    await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                    await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, true);

                    const position = await positionManager.getPosition(trader.address, pairIndex, true);
                    const tradingFee = await positionManager.getTradingFee(pairIndex, true, position.positionAmount);
                    const takerTradingFee = position.positionAmount.mul("30000").mul(80000).div(1e8);

                    expect(tradingFee).to.be.eq(takerTradingFee);
                });

                it('user open short position, collect maker fee', async () => {
                    const {
                        users: [trader],
                        usdt,
                        router,
                        positionManager,
                    } = testEnv;
                    const size = ethers.utils.parseUnits('3', 18);

                    await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                    await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, false);

                    const position = await positionManager.getPosition(trader.address, pairIndex, false);
                    const tradingFee = await positionManager.getTradingFee(pairIndex, false, position.positionAmount);
                    const makerTradingFee = position.positionAmount.mul("30000").mul(50000).div(1e8);

                    expect(tradingFee).to.be.eq(makerTradingFee);
                });
            });
        });

        describe('short > long', () => {
            before('add liquidity', async () => {
                testEnv = await newTestEnv();
                const {
                    users: [depositor, long, short],
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

                const collateral = ethers.utils.parseUnits('3000000', 18);
                const longSize = ethers.utils.parseUnits('30', 18);
                let openPrice = ethers.utils.parseUnits('30000', 30);

                await mintAndApprove(testEnv, usdt, collateral, long, router.address);
                await increasePosition(testEnv, long, pairIndex, collateral, openPrice, longSize, TradeType.MARKET, true);

                const shortSize = ethers.utils.parseUnits('90', 18);

                await mintAndApprove(testEnv, usdt, collateral, short, router.address);
                await increasePosition(testEnv, short, pairIndex, collateral, openPrice, shortSize, TradeType.MARKET, false);
            });

            describe('user open long position', () => {
                before(async () => {
                    const { positionManager } = testEnv;

                    const longTracker = await positionManager.longTracker(pairIndex);
                    const shortTracker = await positionManager.shortTracker(pairIndex);

                    expect(longTracker).to.be.lt(shortTracker);
                });

                it('user open long position, collect maker fee', async () => {
                    const {
                        users: [trader],
                        usdt,
                        router,
                        positionManager,
                    } = testEnv;
                    const size = ethers.utils.parseUnits('3', 18);

                    await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                    await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, true);

                    const position = await positionManager.getPosition(trader.address, pairIndex, true);
                    const tradingFee = await positionManager.getTradingFee(pairIndex, true, position.positionAmount);
                    const makerTradingFee = position.positionAmount.mul("30000").mul(50000).div(1e8);

                    expect(tradingFee).to.be.eq(makerTradingFee);
                });

                it('user open short position, collect taker fee', async () => {
                    const {
                        users: [trader],
                        usdt,
                        router,
                        positionManager,
                    } = testEnv;
                    const size = ethers.utils.parseUnits('3', 18);

                    await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                    await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, false);

                    const position = await positionManager.getPosition(trader.address, pairIndex, false);
                    const tradingFee = await positionManager.getTradingFee(pairIndex, false, position.positionAmount);
                    const takerTradingFee = position.positionAmount.mul("30000").mul(80000).div(1e8);

                    expect(tradingFee).to.be.eq(takerTradingFee);
                });
            });
        });
    });

    describe('Position: collateral', () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor, trader],
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

            const collateral = ethers.utils.parseUnits('3000000', 18);
            const size = ethers.utils.parseUnits('90', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
        });

        it('size = 0, increase collateral', async () => {
            const {
                users: [, trader],
                usdt,
                router,
                positionManager,
            } = testEnv;
            const size = ethers.utils.parseUnits('0', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const oldPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("oldPosition", oldPosition);
            await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, true);

            const latestPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("latestPosition", latestPosition);

            expect(latestPosition.positionAmount).to.be.eq(oldPosition.positionAmount);
            expect(latestPosition.collateral).to.be.gt(oldPosition.collateral);
        });

        it('size != 0, increase collateral', async () => {
            const {
                users: [, trader],
                usdt,
                router,
                positionManager,
            } = testEnv;
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const oldPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("oldPosition", oldPosition);
            await increasePosition(testEnv, trader, pairIndex, collateral, price, size, TradeType.MARKET, true);

            const latestPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("latestPosition", latestPosition);

            expect(latestPosition.positionAmount).to.be.gt(oldPosition.positionAmount);
            expect(latestPosition.collateral).to.be.gt(oldPosition.collateral);
        });

        it('size = 0 and collateral < 0, decrease collateral', async () => {
            const {
                users: [, trader],
                usdt,
                router,
                positionManager,
            } = testEnv;
            const size = ethers.utils.parseUnits('0', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const oldPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("oldPosition", oldPosition);
            await increasePosition(testEnv, trader, pairIndex, "-10000000000000000000000", price, size, TradeType.MARKET, true);

            const latestPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("latestPosition", latestPosition);

            expect(latestPosition.positionAmount).to.be.eq(oldPosition.positionAmount);
            expect(latestPosition.collateral).to.be.lt(oldPosition.collateral);
        });
    });
});
