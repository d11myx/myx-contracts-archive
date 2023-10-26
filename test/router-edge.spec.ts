import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { deployMockCallback, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { expect } from 'chai';
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

        const btcAmount = ethers.utils.parseUnits('45', await btc.decimals());
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
            users: [trader],
            usdt,
            btc,
            router,
            executionLogic,
            positionManager,
            orderManager,
        } = testEnv;

        const amount = ethers.utils.parseUnits('30000', await usdt.decimals());
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

        await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

        const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: amount,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('10', await btc.decimals()),
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', await btc.decimals()),
            maxSlippage: 0,
        };
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest);

        const orderId = 0;
        // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const position = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log(`position:`, position);
        expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', await btc.decimals()));
    });

    it('increase position without adding collateral', async () => {
        const {
            keeper,
            users: [trader],
            orderManager,
            btc,
            positionManager,
            router,
            executionLogic,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;
        expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('10', await btc.decimals()));

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('8', await btc.decimals()),
            maxSlippage: 0,
        };
        const orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountAfter = positionAfter.positionAmount;
        expect(positionAmountAfter).to.be.eq(
            positionAmountBefore.add(ethers.utils.parseUnits('8', await btc.decimals())),
        );
    });

    it('adding collateral without increase position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
            router,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionCollateralBefore = positionBefore.collateral;

        const collateral = await ethers.utils.parseUnits('10000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', await btc.decimals());

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
            btc,
            positionManager,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;

        // Decrease position
        const decreaseAmount = ethers.utils.parseUnits('3', await btc.decimals());
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

        expect(positionAmountAfter).to.be.eq(
            positionAmountBefore.sub(ethers.utils.parseUnits('3', await btc.decimals())),
        );
    });

    describe('Router: Close position', () => {
        it('Closing position', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                positionManager,
                router,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const increaseAmount = ethers.utils.parseUnits('15', await btc.decimals());
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
            const { executeReceipt } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from('0'),
                position.positionAmount,
                TradeType.MARKET,
                true,
            );
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            // await hre.run('decode-event', { hash: executeReceipt.transactionHash, log: true });
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
                users: [trader],
                btc,
                usdt,
                router,
                executionLogic,
                positionManager,
                indexPriceFeed,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('1000', await usdt.decimals());
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

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
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

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
    await router.connect(user.signer).createIncreaseOrder(increasePositionRequest);
    return await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET, 0, 0);
}
