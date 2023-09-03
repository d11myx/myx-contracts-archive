import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove } from './helpers/misc';
import { TradeType } from '../helpers';
import { IRouter, TradingTypes } from '../types/contracts/core/Router';

describe('Trade: TP & SL', () => {
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
        const indexAmount = ethers.utils.parseUnits('10', 18);
        const stableAmount = ethers.utils.parseUnits('300000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('order tp sl', () => {
        it('create order with tp without sl', async () => {
            const {
                users: [trader],
                usdt,
                router,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('9', 18);
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
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(request);

            const orderTpSlRequest: IRouter.CreateOrderTpSlRequestStruct = {
                orderId: orderId,
                tradeType: TradeType.LIMIT,
                isIncrease: true,
                tp: ethers.utils.parseEther('1'),
                tpPrice: 11,
                sl: ethers.utils.parseEther('2'),
                slPrice: 22,
            };
            await router.connect(trader.signer).createOrderTpSl(orderTpSlRequest);

            const orderKey = await orderManager.getOrderKey(orderId, TradeType.LIMIT, true);
            let orderTpSl = await orderManager.orderWithTpSl(orderId);
            console.log(`orderTpSl:`, orderTpSl);

            expect(orderTpSl.tp).to.be.eq(ethers.utils.parseEther('1'));
            expect(orderTpSl.sl).to.be.eq(ethers.utils.parseEther('2'));
            expect(orderTpSl.tpPrice).to.be.eq(11);
            expect(orderTpSl.slPrice).to.be.eq(22);

            orderTpSlRequest.slPrice = 333;
            await router.connect(trader.signer).createOrderTpSl(orderTpSlRequest);
            orderTpSl = await orderManager.orderWithTpSl(orderId);

            expect(orderTpSl.tp).to.be.eq(ethers.utils.parseEther('1'));
            expect(orderTpSl.sl).to.be.eq(ethers.utils.parseEther('2'));
            expect(orderTpSl.tpPrice).to.be.eq(11);
            expect(orderTpSl.slPrice).to.be.eq(333);
        });
    });
});
