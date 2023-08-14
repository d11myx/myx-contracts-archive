import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';

describe('Trade: Market order cases', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);

        await mintAndApprove(testEnv, btc, indexAmount, depositor, pool.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, pool.address);
        await pool.connect(depositor.signer).addLiquidity(pairIndex, indexAmount, stableAmount);
    });

    describe('long > short', () => {
        before(async () => {
            const {
                users: [trader],
                usdt,
                tradingRouter,
                orderManager,
                tradingVault,
            } = testEnv;

            const netExposureAmountBefore = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('3000000', 18);
            const size = ethers.utils.parseUnits('1000', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, true);

            const netExposureAmountAfter = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(size);
            expect(netExposureAmountAfter).to.be.gt(0);
        });

        it('long > short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(size);
        });

        it('long > short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(0);

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(size);
        });

        it('long > short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));

            const size = ethers.utils.parseUnits('5', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long > short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));

            const size = ethers.utils.parseUnits('5', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });

    describe('long < short', () => {
        before(async () => {
            const {
                users: [trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const netExposureAmountBefore = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(ethers.utils.parseUnits('1000', 18));

            const collateral = ethers.utils.parseUnits('3000000', 18);
            const size = ethers.utils.parseUnits('2000', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, false);

            const netExposureAmountAfter = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.sub(size));
            expect(netExposureAmountAfter).to.be.lt(0);
        });

        it('long < short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long < short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long < short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            const size = ethers.utils.parseUnits('10', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long < short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            const size = ethers.utils.parseUnits('10', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });

    describe('long = short', () => {
        before(async () => {
            const {
                users: [trader],
                tradingVault,
            } = testEnv;
            const size = ethers.utils.parseUnits('1000', 18);

            const netExposureAmountBefore = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountBefore).to.be.eq(BigNumber.from('-1000000000000000000000'));

            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);
            const netExposureAmountAfter = await tradingVault.netExposureAmountChecker(pairIndex);
            expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.add(size));
            expect(netExposureAmountAfter).to.be.eq(0);
        });

        it('long = short, increase order, open long position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long = short, increase order, open short position', async () => {
            const {
                users: [, trader],
                usdt,
                tradingRouter,
                tradingVault,
                orderManager,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.add(size));
        });

        it('long = short, decrease order, open long position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            const size = ethers.utils.parseUnits('5', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, true);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });

        it('long = short, decrease order, open short position', async () => {
            const {
                users: [, trader],
                tradingVault,
            } = testEnv;

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionBef.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            const size = ethers.utils.parseUnits('5', 18);
            await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, false);
            expect(positionAft.positionAmount).to.be.eq(positionBef.positionAmount.sub(size));
        });
    });
});
