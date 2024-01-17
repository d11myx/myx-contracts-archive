import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { TradeType } from '../helpers';
import { expect } from './shared/expect';
import { mintAndApprove } from './helpers/misc';
import { IRouter, TradingTypes } from '../types/contracts/core/Router';
import { before } from 'mocha';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE } from './helpers/constants';

describe('cancel orders', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
    });

    it('cancel increaseLimitOrder', async () => {
        const {
            users: [trader, trader1],
            usdt,
            btc,
            router,
            orderManager,
        } = testEnv;

        const collateral = await ethers.utils.parseUnits('10000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', await btc.decimals());

        const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.LIMIT,
            collateral: collateral,
            openPrice: openPrice,
            isLong: true,
            sizeAmount: sizeAmount,
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', await btc.decimals()),
            maxSlippage: 0,
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
            tpNetworkFeeAmount: NETWORK_FEE_AMOUNT,
            slNetworkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        const orderId = await orderManager.ordersIndex();
        const cancelOrder: IRouter.CancelOrderRequestStruct = {
            orderId: orderId,
            tradeType: TradeType.LIMIT,
            isIncrease: true,
        };
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await mintAndApprove(testEnv, usdt, collateral, trader1, router.address);
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
        expect((await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT)).order.sizeAmount).to.be.eq(sizeAmount);
        expect(router.connect(trader1.signer).cancelOrder(cancelOrder)).to.be.revertedWith('onlyAccount');
        await router.connect(trader.signer).cancelOrder(cancelOrder);
        expect((await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT)).order.sizeAmount).to.be.eq(0);
    });
    it('cancel decreaseLimitOrder', async () => {
        const {
            users: [trader, trader1],
            usdt,
            btc,
            router,
            orderManager,
        } = testEnv;

        const collateral = await ethers.utils.parseUnits('10000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', await btc.decimals());

        const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.LIMIT,
            collateral: collateral,
            triggerPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: sizeAmount,
            maxSlippage: 0,
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        const orderId = await orderManager.ordersIndex();
        const cancelOrder: IRouter.CancelOrderRequestStruct = {
            orderId: orderId,
            tradeType: TradeType.LIMIT,
            isIncrease: false,
        };
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await mintAndApprove(testEnv, usdt, collateral, trader1, router.address);
        await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
        expect((await orderManager.getDecreaseOrder(orderId, TradeType.LIMIT)).order.sizeAmount).to.be.eq(sizeAmount);
        expect(router.connect(trader1.signer).cancelOrder(cancelOrder)).to.be.revertedWith('onlyAccount');
        await router.connect(trader.signer).cancelOrder(cancelOrder);
        expect((await orderManager.getDecreaseOrder(orderId, TradeType.LIMIT)).order.sizeAmount).to.be.eq(0);
    });

    it('cancel increaseMarketOrder', async () => {
        const {
            users: [trader, trader1],
            usdt,
            btc,
            router,
            orderManager,
        } = testEnv;

        const collateral = await ethers.utils.parseUnits('10000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', await btc.decimals());

        const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            openPrice: openPrice,
            isLong: true,
            sizeAmount: sizeAmount,
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', await btc.decimals()),
            maxSlippage: 0,
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
            tpNetworkFeeAmount: NETWORK_FEE_AMOUNT,
            slNetworkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        const orderId = await orderManager.ordersIndex();
        const cancelOrder: IRouter.CancelOrderRequestStruct = {
            orderId: orderId,
            tradeType: TradeType.MARKET,
            isIncrease: true,
        };
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await mintAndApprove(testEnv, usdt, collateral, trader1, router.address);
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        expect((await orderManager.getIncreaseOrder(orderId, TradeType.MARKET)).order.sizeAmount).to.be.eq(sizeAmount);
        expect(router.connect(trader1.signer).cancelOrder(cancelOrder)).to.be.revertedWith('onlyAccount');
        await router.connect(trader.signer).cancelOrder(cancelOrder);
        expect((await orderManager.getDecreaseOrder(orderId, TradeType.MARKET)).order.sizeAmount).to.be.eq(0);
    });
    it('cancel decreaseMarketOrder', async () => {
        const {
            users: [trader, trader1],
            usdt,
            btc,
            router,
            orderManager,
        } = testEnv;

        const collateral = await ethers.utils.parseUnits('10000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('8', await btc.decimals());

        const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            triggerPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: sizeAmount,
            maxSlippage: 0,
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        const orderId = await orderManager.ordersIndex();
        const cancelOrder: IRouter.CancelOrderRequestStruct = {
            orderId: orderId,
            tradeType: TradeType.MARKET,
            isIncrease: false,
        };
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await mintAndApprove(testEnv, usdt, collateral, trader1, router.address);
        await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);

        expect((await orderManager.getDecreaseOrder(orderId, TradeType.MARKET)).order.sizeAmount).to.be.eq(sizeAmount);
        expect(router.connect(trader1.signer).cancelOrder(cancelOrder)).to.be.revertedWith('onlyAccount');
        await router.connect(trader.signer).cancelOrder(cancelOrder);
        expect((await orderManager.getDecreaseOrder(orderId, TradeType.MARKET)).order.sizeAmount).to.be.eq(0);
    });
});
