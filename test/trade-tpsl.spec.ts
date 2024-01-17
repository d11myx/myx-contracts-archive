import { newTestEnv, testEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { TradeType, ZERO_ADDRESS } from '../helpers';
import { IRouter, TradingTypes } from '../types/contracts/core/Router';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE } from './helpers/constants';

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
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
            tpNetworkFeeAmount: NETWORK_FEE_AMOUNT,
            slNetworkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        let orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(request);
        await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
            [btc.address],
            [await indexPriceFeed.getPrice(btc.address)],
            [
                new ethers.utils.AbiCoder().encode(
                    ['uint256'],
                    [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                ),
            ],
            [
                {
                    orderId: orderId,
                    tradeType: TradeType.MARKET,
                    isIncrease: true,
                    tier: 0,
                    referralsRatio: 0,
                    referralUserRatio: 0,
                    referralOwner: ZERO_ADDRESS,
                },
            ],
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
            paymentType: PAYMENT_TYPE,
            networkFeeAmount: NETWORK_FEE_AMOUNT,
            tpNetworkFeeAmount: NETWORK_FEE_AMOUNT,
            slNetworkFeeAmount: NETWORK_FEE_AMOUNT,
        };

        orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(request1);
        await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
            [btc.address],
            [await indexPriceFeed.getPrice(btc.address)],
            [
                new ethers.utils.AbiCoder().encode(
                    ['uint256'],
                    [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                ),
            ],
            [
                {
                    orderId: orderId,
                    tradeType: TradeType.MARKET,
                    isIncrease: true,
                    tier: 0,
                    referralsRatio: 0,
                    referralUserRatio: 0,
                    referralOwner: ZERO_ADDRESS,
                },
            ],
            { value: 1 },
        );

        positionOrders = await orderManager.getPositionOrders(positionKey);

        expect(positionOrders.length).to.be.eq(4);
    });
});
