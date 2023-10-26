import { ethers } from 'hardhat';
import { EXECUTION_LOGIC_ID, TradeType } from '../helpers';
import { newTestEnv, TestEnv } from './helpers/make-suite';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Executor: require check', () => {
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
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('50', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('permission check', async () => {
        before('before increase position', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            const stableAmount = ethers.utils.parseUnits('100000', await btc.decimals());
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);

            const collateral = ethers.utils.parseUnits('50000', await usdt.decimals());
            const increaseSize = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                increaseSize,
                TradeType.MARKET,
                true,
            );
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(position.positionAmount).to.be.eq(increaseSize);

            it('check permissions, only keeper executor order', async () => {
                const {
                    keeper,
                    users: [trader, user1],
                    router,
                    executionLogic,
                    orderManager,
                    positionManager,
                } = testEnv;

                const position = await positionManager.getPosition(trader.address, pairIndex, true);

                const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                const decreaseSize = ethers.utils.parseUnits('10', await btc.decimals());

                // await decreasePosition(testEnv, trader, pairIndex, collateral, decreaseSize, TradeType.MARKET, true);
                const request: TradingTypes.DecreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    triggerPrice: openPrice,
                    isLong: true,
                    sizeAmount: decreaseSize,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createDecreaseOrder(request);
                await expect(
                    executionLogic
                        .connect(user1.signer)
                        .executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0, false, 0, true),
                ).to.be.revertedWith('opk');
                await executionLogic
                    .connect(keeper.signer)
                    .executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0, false, 0, true);
            });
        });
    });
});
