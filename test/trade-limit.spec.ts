import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradeType } from '../helpers';

describe('Trade: Limit order cases', () => {
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
        it('long > short, increase order, open long position', async () => {
            const {
                keeper,
                users: [, trader],
                usdt,
                btc,
                positionManager,
                orderManager,
                router,
                executionLogic,
            } = testEnv;

            // update BTC price
            await updateBTCPrice(testEnv, '32000');

            const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
            const increaseAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const triggerPrice = ethers.utils.parseUnits('32000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const { orderId } = await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                triggerPrice,
                increaseAmount,
                TradeType.LIMIT,
                true,
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`---positionAft: `, positionAft);

            await executionLogic
                .connect(keeper.signer)
                .executeIncreaseLimitOrders([{ orderId: orderId, level: 0, commissionRatio: 0 }]);
            // expect(positionAft.positionAmount).to.be.eq(size);
        });

        it('long > short, increase order, open short position', async () => {});

        it('long > short, decrease order, open long position', async () => {});

        it('long > short, decrease order, open short position', async () => {});
    });

    describe('long < short', () => {
        //     before(async () => {
        //         const {
        //         users: [trader],
        //         usdt,
        //         positionManager,
        //         orderManager,
        //         } = testEnv;
        //
        //         const netExposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
        //         expect(netExposureAmountBefore).to.be.eq(ethers.utils.parseUnits('1000', 18));
        //
        //         const collateral = ethers.utils.parseUnits('3000000', 18);
        //         const size = ethers.utils.parseUnits('2000', 18);
        //
        //         await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
        //         await increasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, false);
        //
        //         const netExposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
        //         expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.sub(size));
        //         expect(netExposureAmountAfter).to.be.lt(0);
        //     });

        it('long < short, increase order, open long position', async () => {});

        it('long < short, increase order, open short position', async () => {});

        it('long < short, decrease order, open long position', async () => {});

        it('long < short, decrease order, open short position', async () => {});
    });

    describe('long = short', () => {
        // before(async () => {
        //     const {
        //         users: [trader],
        //         positionManager,
        //     } = testEnv;
        //     const size = ethers.utils.parseUnits('1000', 18);
        //
        //     const netExposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
        //     expect(netExposureAmountBefore).to.be.eq(BigNumber.from('-1000000000000000000000'));
        //
        //     await decreasePosition(testEnv, trader, pairIndex, BigNumber.from(0), size, TradeType.MARKET, false);
        //     const netExposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
        //     expect(netExposureAmountAfter).to.be.eq(netExposureAmountBefore.add(size));
        //     expect(netExposureAmountAfter).to.be.eq(0);
        // });

        it('long = short, increase order, open long position', async () => {});

        it('long = short, increase order, open short position', async () => {});

        it('long = short, decrease order, open long position', async () => {});

        it('long = short, decrease order, open short position', async () => {});
    });
});
