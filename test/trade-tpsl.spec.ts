import { newTestEnv, testEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { TradeType } from '../helpers';
import { IRouter, TradingTypes } from '../types/contracts/core/Router';

describe('Trade: TP & SL', () => {
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
        const indexAmount = ethers.utils.parseUnits('10', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000', await usdt.decimals());
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
    after(async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
        } = testEnv;

        const decreaseCollateral = ethers.utils.parseUnits('0', await usdt.decimals());
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const decreaseAmount = positionBefore.positionAmount;
        await decreasePosition(testEnv, trader, pairIndex, decreaseCollateral, decreaseAmount, TradeType.MARKET, true);
    });

    it('create order with tp sl', async () => {
        const {
            keeper,
            users: [trader],
            usdt,
            btc,
            router,
            executor,
            indexPriceFeed,
            oraclePriceFeed,
            orderManager,
            positionManager,
        } = testEnv;

        const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
        const size = ethers.utils.parseUnits('9', await btc.decimals());
        let openPrice = ethers.utils.parseUnits('30000', 30);

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        const request: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            openPrice: openPrice,
            isLong: true,
            sizeAmount: size,
            maxSlippage: 0,
            tp: ethers.utils.parseUnits('5', await btc.decimals()),
            tpPrice: ethers.utils.parseUnits('60000', 30),
            sl: ethers.utils.parseUnits('5', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('10000', 30),
        };

        let orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(request);
        await executor
            .connect(keeper.signer)
            .setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                { value: 1 },
            );

        const positionKey = positionManager.getPositionKey(trader.address, pairIndex, true);
        let positionOrders = await orderManager.getPositionOrders(positionKey);

        expect(positionOrders.length).to.be.eq(2);

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        const request1: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('10', await btc.decimals()),
            maxSlippage: 0,
            tp: ethers.utils.parseUnits('5', await btc.decimals()),
            tpPrice: ethers.utils.parseUnits('60000', 30),
            sl: ethers.utils.parseUnits('5', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('10000', 30),
        };

        orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(request1);
        await executor
            .connect(keeper.signer)
            .setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                { value: 1 },
            );

        positionOrders = await orderManager.getPositionOrders(positionKey);

        expect(positionOrders.length).to.be.eq(4);
    });

    describe('order tp sl', () => {
        it('create order with tp without sl', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const request: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                openPrice: openPrice,
                isLong: true,
                sizeAmount: size,
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(request);

            const orderTpSlRequest: IRouter.CreateOrderTpSlRequestStruct = {
                orderId: orderId,
                tradeType: TradeType.LIMIT,
                isIncrease: true,
                tp: ethers.utils.parseUnits('1', await btc.decimals()),
                tpPrice: 11,
                sl: ethers.utils.parseUnits('2', await btc.decimals()),
                slPrice: 22,
            };
            await router.connect(trader.signer).addOrderTpSl(orderTpSlRequest);

            // const orderKey = await orderManager.getOrderKey(orderId, TradeType.LIMIT, true);
            let orderTpSl = await orderManager.orderWithTpSl(orderId);
            // console.log(`orderTpSl:`, orderTpSl);

            expect(orderTpSl.tp).to.be.eq(ethers.utils.parseUnits('1', await btc.decimals()));
            expect(orderTpSl.sl).to.be.eq(ethers.utils.parseUnits('2', await btc.decimals()));
            expect(orderTpSl.tpPrice).to.be.eq(11);
            expect(orderTpSl.slPrice).to.be.eq(22);

            orderTpSlRequest.slPrice = 333;
            await router.connect(trader.signer).addOrderTpSl(orderTpSlRequest);
            orderTpSl = await orderManager.orderWithTpSl(orderId);

            expect(orderTpSl.tp).to.be.eq(ethers.utils.parseUnits('1', await btc.decimals()));
            expect(orderTpSl.sl).to.be.eq(ethers.utils.parseUnits('2', await btc.decimals()));
            expect(orderTpSl.tpPrice).to.be.eq(11);
            expect(orderTpSl.slPrice).to.be.eq(333);
        });
    });
});
