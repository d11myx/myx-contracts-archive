import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';

describe('Trade: Market order cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
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

    describe('long > short', () => {
        before(async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const netExposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('1000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const netExposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(size);
            expect(netExposureAmountAfter).to.be.gt(0);
        });

        it('long > short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(size);
        });

        it('long > short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(size);
        });

        it('long > short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('10', await btc.decimals()));

            const size = ethers.utils.parseUnits('5', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long > short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('10', await btc.decimals()));

            const size = ethers.utils.parseUnits('5', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });

    describe('long < short', () => {
        before(async () => {
            const {
                users: [trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const netExposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(ethers.utils.parseUnits('1000', await btc.decimals()));

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const size = ethers.utils.parseUnits('2000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const netExposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.sub(size));
            expect(netExposureAmountAfter).to.be.lt(0);
        });

        it('long < short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', await btc.decimals()));

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long < short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', await btc.decimals()));

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long < short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', await btc.decimals()));

            const size = ethers.utils.parseUnits('10', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long < short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', await btc.decimals()));

            const size = ethers.utils.parseUnits('10', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });

    describe('long = short', () => {
        before(async () => {
            const {
                users: [trader],
                positionManager,
                btc,
            } = testEnv;
            const size = ethers.utils.parseUnits('1000', await btc.decimals());

            const netExposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(BigNumber.from('-100000000000'));

            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);
            const netExposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.add(size));
            expect(netExposureAmountAfter).to.be.eq(0);
        });

        it('long = short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                positionManager,
                router,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', await btc.decimals()));

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long = short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', await btc.decimals()));

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long = short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', await btc.decimals()));

            const size = ethers.utils.parseUnits('5', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long = short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                positionManager,
                btc,
            } = testEnv;

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', await btc.decimals()));

            const size = ethers.utils.parseUnits('5', await btc.decimals());
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            // console.log(`---positionAft:`, positionAft);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });
});
