import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { deployMockCallback, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { expect } from './shared/expect';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: Edge cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();

        await updateBTCPrice(testEnv, '30000');
    });

    it('add liquidity', async () => {
        const {
            deployer,
            btc,
            usdt,
            users: [depositor],

            pool,
        } = testEnv;

        const btcAmount = ethers.utils.parseUnits('34', await btc.decimals());
        const usdtAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
        await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
        await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));
        let testCallBack = await deployMockCallback();
        const pair = await pool.getPair(pairIndex);

        await btc.connect(depositor.signer).approve(testCallBack.address, MAX_UINT_AMOUNT);
        await usdt.connect(depositor.signer).approve(testCallBack.address, MAX_UINT_AMOUNT);
        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, btcAmount, usdtAmount);

        const pairVaultInfo = await pool.getVault(pairIndex);
        // console.log(
        //     `indexTotalAmount:`,
        //     ethers.utils.formatUnits(pairVaultInfo.indexTotalAmount, await btc.decimals()),
        // );
        // console.log(
        //     `stableTotalAmount:`,
        //     ethers.utils.formatUnits(pairVaultInfo.stableTotalAmount, await usdt.decimals()),
        // );
    });

    it('open position with adding collateral', async () => {
        const {
            deployer,
            keeper,
            users: [trader,trader1],
            usdt,
            router,
            executionLogic,
            positionManager,
            orderManager,
        } = testEnv;

        const amount = ethers.utils.parseUnits('330000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));
        await waitForTx(await usdt.connect(deployer.signer).mint(trader1.address, amount));

        await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);
        await usdt.connect(trader1.signer).approve(router.address, MAX_UINT_AMOUNT);

        const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: amount,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('10', 18),
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', 18),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', 18),
            maxSlippage: 0,
        };
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);


        const orderId = 0;
        // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

        expect(router.connect(trader1.signer).cancelIncreaseOrder(orderId,TradeType.MARKET)).to.be.revertedWith('onlyAccount')


        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const position = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log(`position:`, position);
        expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));
    });

    it('increase position without adding collateral', async () => {
        const {
            usdt,
            deployer,
            keeper,
            users: [trader,trader1],
            orderManager,
            positionManager,
            router,
            executionLogic,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;
        expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('10', 18));

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: ethers.utils.parseUnits('30000', 18),
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('8', 18),
            maxSlippage: 0,
        };
        const amount = ethers.utils.parseUnits('3300000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));
        await waitForTx(await usdt.connect(deployer.signer).mint(trader1.address, amount));

        await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);
        await usdt.connect(trader1.signer).approve(router.address, MAX_UINT_AMOUNT);

        const orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
        expect(router.connect(trader1.signer).cancelIncreaseOrder(orderId,TradeType.MARKET)).to.be.revertedWith('onlyAccount')


        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountAfter = positionAfter.positionAmount;
        expect(positionAmountAfter).to.be.eq(positionAmountBefore.add(ethers.utils.parseUnits('8', 18)));
    });

    it('adding collateral without increase position', async () => {
        const {
            users: [trader],
            usdt,
            positionManager,
            router,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionCollateralBefore = positionBefore.collateral;

        const collateral = await ethers.utils.parseUnits('10000', 18);
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', 18);

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionCollateralAfter = positionAfter.collateral;

        const traderFee = positionCollateralBefore.sub(positionCollateralAfter.sub(collateral));
        expect(positionCollateralAfter).to.be.eq(positionCollateralBefore.add(collateral).sub(traderFee));
    });

    it('decrease position', async () => {
        const {
            users: [trader],
            positionManager,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;

        // Decrease position
        const decreaseAmount = ethers.utils.parseUnits('3', 18);
        const collateral = ethers.utils.parseUnits('0', 18);
        const triggerPrice = ethers.utils.parseUnits('30000', 30);

        await decreasePosition(
            testEnv,
            trader,
            pairIndex,
            collateral,
            decreaseAmount,
            TradeType.MARKET,
            true,
            triggerPrice,
        );

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountAfter = positionAfter.positionAmount;

        expect(positionAmountAfter).to.be.eq(positionAmountBefore.sub(ethers.utils.parseUnits('3', 18)));
    });

    describe('Router: ADL cases', () => {
        const pairIndex = 1;

        before(async () => {
            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);
        });
        after(async () => {
            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);
        });

        // it('execute adl', async () => {
        //     const {
        //         keeper,
        //         users: [trader, shorter,shorter1],
        //         usdt,
        //         pool,
        //         positionManager,
        //         orderManager,
        //         router,
        //         executionLogic,
        //         executor,
        //     } = testEnv;
        //
        //     let collateral = ethers.utils.parseUnits('300000', 18);
        //     await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        //
        //     // trader take all indexToken
        //     await increaseUserPosition(
        //         trader,
        //         pairIndex,
        //         collateral,
        //         ethers.utils.parseUnits('30000', 30),
        //         ethers.utils.parseUnits('18.66', 18),
        //         true,
        //         testEnv,
        //     );
        //
        //     // shorter open position
        //     collateral = ethers.utils.parseUnits('27000', 18);
        //     await mintAndApprove(testEnv, usdt, collateral, shorter, router.address);
        //     await increaseUserPosition(
        //         shorter,
        //         pairIndex,
        //         collateral,
        //         ethers.utils.parseUnits('30000', 30),
        //         ethers.utils.parseUnits('30', 18),
        //         false,
        //         testEnv,
        //     );
        //
        //     // trader take all indexToken
        //     await increaseUserPosition(
        //         trader,
        //         pairIndex,
        //         collateral,
        //         ethers.utils.parseUnits('30000', 30),
        //         ethers.utils.parseUnits('30', 18),
        //         true,
        //         testEnv,
        //     );
        //
        //     const pairVaultInfo = await pool.getVault(pairIndex);
        //     // console.log(
        //     //     'indexTotalAmount',
        //     //     pairVaultInfo.indexTotalAmount,
        //     //     'indexReservedAmount',
        //     //     pairVaultInfo.indexReservedAmount,
        //     // );
        //     // expect(pairVaultInfo.indexTotalAmount.sub(pairVaultInfo.indexReservedAmount)).to.be.eq(
        //     //     '306000000000000000',
        //     // );
        //
        //     // shorter decrease position will wait for adl
        //     const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
        //         account: shorter.address,
        //         pairIndex: pairIndex,
        //         tradeType: TradeType.MARKET,
        //         collateral: collateral,
        //         triggerPrice: ethers.utils.parseUnits('30000', 30),
        //         isLong: false,
        //         sizeAmount: ethers.utils.parseUnits('5', 18),
        //         maxSlippage: 0,
        //     };
        //     const decreaseOrderId = await orderManager.ordersIndex();
        //
        //     await usdt.connect(shorter.signer).approve(router.address, MAX_UINT_AMOUNT);
        //     await usdt.connect(shorter1.signer).approve(router.address, MAX_UINT_AMOUNT);
        //
        //     await router.connect(shorter.signer).createDecreaseOrder(decreasePositionRequest);
        //     expect(router.connect(shorter1.signer).cancelDecreaseOrder(decreaseOrderId,TradeType.MARKET)).to.be.revertedWith('onlyAccount')
        //
        //
        //     await executionLogic
        //         .connect(keeper.signer)
        //         .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
        //
        //     const decreaseOrderInfo = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
        //     //expect(decreaseOrderInfo.needADL).to.be.eq(true);
        //
        //     // execute ADL
        //     let traderPositionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
        //     let traderCurPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        //     // console.log(traderCurPosition);
        //     await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
        //         [
        //             {
        //                 positionKey: traderPositionKey,
        //                 sizeAmount: ethers.utils.parseUnits('5', 18),
        //                 level: 0,
        //                 commissionRatio: 0,
        //             },
        //         ],
        //         decreaseOrderId,
        //         TradeType.MARKET,
        //         0,
        //         0,
        //     );
        // });
    });

    describe('Router: Close position', () => {
        it('Closing position', async () => {
            const {
                users: [trader],
                usdt,
                positionManager,
                router,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            const collateral = ethers.utils.parseUnits('30000', 30);
            const increaseAmount = ethers.utils.parseUnits('15', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                increaseAmount,
                TradeType.MARKET,
                true,
            );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // Closing position
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from('0'),
                position.positionAmount,
                TradeType.MARKET,
                true,
            );
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.positionAmount).to.be.eq(0);
        });
    });

    describe('Router: Liquidation', () => {
        const pairIndex = 1;

        before(async () => {
            await updateBTCPrice(testEnv, '30000');
        });
        after(async () => {
            await updateBTCPrice(testEnv, '30000');
        });

        it("user's position leverage exceeded 50x, liquidated", async () => {
            const {
                deployer,
                keeper,
                users: [trader,trader1],
                btc,
                usdt,
                router,
                executionLogic,
                positionManager,
                indexPriceFeed,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('1000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);
            await usdt.connect(trader1.signer).approve(router.address, MAX_UINT_AMOUNT);

            const size = collateral.div(30000).mul(50).mul(90).div(100);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: size,
                maxSlippage: 0,
            };

            // await tradingRouter.setHandler(trader.address, true);
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            expect(router.connect(trader1.signer).cancelIncreaseOrder(orderId,TradeType.MARKET)).to.be.revertedWith('onlyAccount')


            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);

            const leverageBef = positionBef.positionAmount.div(positionBef.collateral.div(30000));
            // expect(leverageBef).to.be.eq(46);
            // expect(positionBef.positionAmount).to.be.eq('1499999999999999985');

            // // price goes down, trader's position can be liquidated
            // await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('20000', 8)));
            // await waitForTx(
            //     await indexPriceFeed
            //         .connect(keeper.signer)
            //         .setPrices(
            //             [btc.address],
            //             [ethers.utils.parseUnits('20000', 30)],
            //             (await getBlockTimestamp()) + 100,
            //         ),
            // );

            // const leverageAft = positionBef.positionAmount.div(positionBef.collateral.div(30000 + 10000));
            // expect(leverageAft).to.be.eq(61);
            // // liquidation
            // const traderPositionKey = positionManager.getPositionKey(trader.address, pairIndex, true);
            // await executor
            //     .connect(keeper.signer)
            //     .liquidatePositions([{ positionKey: traderPositionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

            //todo
            // const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            // expect(positionAft.positionAmount).to.be.eq(0);
        });
    });
});

export async function increaseUserPosition(
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    price: BigNumber,
    size: BigNumber,
    isLong: boolean,
    testEnv: TestEnv,
) {
    const { keeper, orderManager, router, executionLogic } = testEnv;

    const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: collateral,
        openPrice: price,
        isLong: isLong,
        sizeAmount: size,
        maxSlippage: 0,
    };

    // await router.setHandler(user.address, true);
    const increaseOrderId = await orderManager.ordersIndex();
    await router.connect(user.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
    await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET, 0, 0);
}