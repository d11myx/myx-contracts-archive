import { ethers } from 'hardhat';
import { EXECUTION_LOGIC_ID, TradeType, ZERO_ADDRESS } from '../helpers';
import { newTestEnv, TestEnv } from './helpers/make-suite';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { TradingTypes } from '../types/contracts/core/Router';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE } from './helpers/constants';

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
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );
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
                    executor,
                    indexPriceFeed,
                    oraclePriceFeed,
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
                    paymentType: PAYMENT_TYPE,
                    networkFeeAmount: NETWORK_FEE_AMOUNT,
                };

                const orderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createDecreaseOrder(request);
                await expect(
                    executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                                tier: 0,
                                referralsRatio: 0,
                                referralUserRatio: 0,
                                referralOwner: ZERO_ADDRESS,
                            },
                        ],
                        { value: 1 },
                    ),
                ).to.be.revertedWith('opk');
                await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                            tier: 0,
                            referralsRatio: 0,
                            referralUserRatio: 0,
                            referralOwner: ZERO_ADDRESS,
                        },
                    ],
                    { value: 1 },
                );
            });
        });
    });
});
