import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove, updateBTCPrice, extraHash } from './helpers/misc';
import { TradeType, ZERO_ADDRESS } from '../helpers';
import { TradingTypes } from '../types/contracts/core/Router';
import { BigNumber } from 'ethers';
import { expect } from './shared/expect';

describe('Trade: Limit order', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('user open position, trigger exceeds max position', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000000', await btc.decimals());
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

        it('should create order fail', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                sizeAmount,
                TradeType.LIMIT,
                true,
            );

            // batch increase
            const increaseArrays = [];
            for (let i = 0; i < 99; i++) {
                increaseArrays.push(
                    await increasePosition(
                        testEnv,
                        trader,
                        pairIndex,
                        BigNumber.from(0),
                        openPrice,
                        sizeAmount,
                        TradeType.LIMIT,
                        true,
                    ),
                );
            }
            Promise.all(increaseArrays);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('position: ', position);

            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: BigNumber.from(0),
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            // create order trigger exceeds max position
            await expect(router.connect(trader.signer).createIncreaseOrder(positionRequest)).to.be.revertedWith(
                'exceeds max position',
            );
        });
    });

    describe('user open position, trigger not reach trigger price', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
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

        it('should cancel order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);
            const orderBefore = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);

            expect(orderBefore.sizeAmount).to.be.eq(sizeAmount);

            // update price
            await updateBTCPrice(testEnv, '32000');

            // execution order
            const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
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
                        orderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const reason = await extraHash(tx.hash, 'ExecuteOrderError', 'errorMessage');

            expect(reason).to.be.eq('not reach trigger price');

            const orderAfter = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);

            // cancel order
            expect(position.positionAmount).to.be.eq('0');
            expect(orderAfter.sizeAmount).to.be.eq('0');
        });
    });

    describe('the user opens the position, closes the position, and cancels the same direction of the entrusted order', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
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

        it('should cancel same direction entrust order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // open long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            // open short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(shortPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            // create long entrust order
            const longEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longEntrustOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longEntrustPositionRequest);
            const longEntrustOrderBefore = await orderManager.getIncreaseOrder(longEntrustOrderId, TradeType.LIMIT);

            expect(longEntrustOrderBefore.sizeAmount).to.be.eq(sizeAmount);

            // create long entrust order shared collateral
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const longEntrustPositionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longEntrustOrderId2 = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longEntrustPositionRequest2);
            const longEntrustOrderBefore2 = await orderManager.getIncreaseOrder(longEntrustOrderId2, TradeType.LIMIT);

            expect(longEntrustOrderBefore2.sizeAmount).to.be.eq(sizeAmount);

            // create short entrust order
            const shortEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortEntrustOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(shortEntrustPositionRequest);
            const shortEntrustOrderBefore = await orderManager.getIncreaseOrder(shortEntrustOrderId, TradeType.LIMIT);

            expect(shortEntrustOrderBefore.sizeAmount).to.be.eq(sizeAmount);

            // create decrease short entrust order
            const decreaseShortPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const decreaseShortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseShortPositionRequest);
            const decreaseShoreOrderBefore = await orderManager.getDecreaseOrder(decreaseShortOrderId, TradeType.LIMIT);

            expect(decreaseShoreOrderBefore.sizeAmount).to.be.eq(sizeAmount);

            // create decrease long entrust order
            const decreaseLongPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: sizeAmount,
                maxSlippage: 0,
            };
            const decreaseLongOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);

            // execution order
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseLimitOrders(
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
                        orderId: decreaseLongOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreasLongOrderAfter = await orderManager.getDecreaseOrder(decreaseLongOrderId, TradeType.LIMIT);
            const longEntrustOrderAfter = await orderManager.getIncreaseOrder(longEntrustOrderId, TradeType.LIMIT);
            const longEntrustOrderAfter2 = await orderManager.getIncreaseOrder(longEntrustOrderId2, TradeType.LIMIT);

            // cancel long increase entrust order
            expect(decreasLongOrderAfter.sizeAmount).to.be.eq('0');
            expect(longEntrustOrderAfter.sizeAmount).to.be.eq('0');
            expect(longEntrustOrderAfter2.sizeAmount).to.be.eq('0');

            const decreasShoreOrderAfter = await orderManager.getDecreaseOrder(decreaseShortOrderId, TradeType.LIMIT);
            const shortEntrustOrderAfter = await orderManager.getIncreaseOrder(shortEntrustOrderId, TradeType.LIMIT);

            // reserve short entrust and decrease order
            expect(decreasShoreOrderAfter.sizeAmount).to.be.eq(sizeAmount);
            expect(shortEntrustOrderAfter.sizeAmount).to.be.eq(sizeAmount);
        });
    });


});
