import { newTestEnv, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { extraHash, getUpdateData, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import {
    TradeType,
    convertIndexAmountToStable,
    convertStableAmountToIndex,
    getMockToken,
    ZERO_ADDRESS,
} from '../helpers';
import { BigNumber } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';
import { MARKET_NAME } from '../helpers/env';
import { loadReserveConfig } from '../helpers/market-config-helper';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE, PERCENTAGE, PRICE_PRECISION } from './helpers/constants';

describe('Trade: ioc', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('increase market position', () => {
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
            const indexAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('illiquidity, should partial transaction and delete order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                pool,
                orderManager,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, vaultBefore.indexTotalAmount);
            expect(indexToStableAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balance = await usdt.balanceOf(trader.address);
            expect(balance).to.be.eq(collateral);

            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrder = await orderManager.getIncreaseOrder(longOrderId, TradeType.MARKET);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrder.order.sizeAmount).to.be.eq('0');

            /* increase short position */
            const vaultAfter = await pool.getVault(pairIndex);
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(shortPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.MARKET);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);
            const stableToIndexAmount = await convertStableAmountToIndex(btc, usdt, availableStable);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    stableToIndexAmount.mul(PRICE_PRECISION).div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.order.sizeAmount).to.be.eq('0');
        });
    });

    describe('increase limit position', () => {
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
            const indexAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('illiquidity, should partial transaction and reserve order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                pool,
                poolView,
                orderManager,
                executor,
                oraclePriceFeed,
                indexPriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, vaultBefore.indexTotalAmount);
            expect(indexToStableAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balance = await usdt.balanceOf(trader.address);
            expect(balance).to.be.eq(collateral);

            /* increase long position */
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrderBefor = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrderBefor.order.executedSize).to.be.eq(longPosition.positionAmount);

            /* increase short position */
            const vaultAfter = await pool.getVault(pairIndex);
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);
            const stableToIndexAmount = await convertStableAmountToIndex(btc, usdt, availableStable);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    stableToIndexAmount.mul(PRICE_PRECISION).div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.order.executedSize).to.be.eq(shortPosition.positionAmount);

            // add liquidity
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const totoalApplyBefore = await lpToken.totalSupply();
            const indexAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const expectAddLiquidity = await poolView.getMintLpAmount(
                pairIndex,
                indexAmount,
                stableAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            await router
                .connect(trader.signer)
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
                    [0],
                    { value: 1 },
                );
            const totoalApplyAfter = await lpToken.totalSupply();

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);

            // keeper execute order
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: longOrderId,
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
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const longOrderAfter = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);
            const shortOrderAfter = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);

            expect(longOrderAfter.order.sizeAmount).to.be.eq('0');
            expect(shortOrderAfter.order.sizeAmount).to.be.eq('0');
        });
    });

    describe('decrease market position', () => {
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
            const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('size exceed max config, should partial transaction and delete order', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                pool,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('6000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            let increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: increaseOrderId,
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const long2PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(long2PositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: increaseOrderId,
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
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.positionAmount).to.be.eq(sizeAmount.add(positionBefore.positionAmount));

            /* decrease long position, should partial transaction */
            const decreaseLongPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: positionAfter.positionAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const decreasePositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            // expect(decreasePositionAfter.positionAmount).to.be.eq(
            //     positionAfter.positionAmount.sub(tradingConfig.maxTradeAmount),
            // );
            expect(decreaseOrder.order.sizeAmount).to.be.eq('0');
        });
    });

    describe('decrease limit position', () => {
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
            const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('size exceed max config, should partial transaction and reserve order', async () => {
            const {
                users: [, trader],
                btc,
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('6000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            /* increase long position */
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            let increaseOrderId = await orderManager.ordersIndex();
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
                [0],
                [
                    {
                        orderId: increaseOrderId,
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const long2PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(long2PositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: increaseOrderId,
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
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.positionAmount).to.be.eq(sizeAmount.add(positionBefore.positionAmount));

            /* decrease long position, should partial transaction */
            const decreaseLongPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: positionAfter.positionAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            const ret = await executor.connect(keeper.signer).setPricesAndExecuteDecreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const executedSize = await extraHash(ret.hash, 'ExecuteDecreaseOrder', 'executedSize');
            // await hre.run('decode-event', { hash: ret.hash, log: true });
            // const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);

            const tradingConfig = await pool.getTradingConfig(pairIndex);
            let decreasePositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePositionAfter.positionAmount).to.be.eq(0);
            expect(executedSize).to.be.eq(positionAfter.positionAmount.sub(decreasePositionAfter.positionAmount));

            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            decreasePositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePositionAfter.positionAmount).to.be.eq('0');
        });
    });

    describe('decrease market position, trigger ADL', () => {
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

            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('should partial transaction and reserve ADL order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            /* increase long position */
            const vaultBefore = await pool.getVault(pairIndex);
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(longPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(shortPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* short decrease position will wait for adl */
            const decreaseLongPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.order.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);

            await executor.connect(keeper.signer).setPricesAndExecuteADLOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                pairIndex,
                [
                    {
                        positionKey,
                        sizeAmount: decreaseOrder.order.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.order.sizeAmount.sub(decreaseOrderAdlAfter.order.executedSize),
            );
        });
    });

    describe('decrease limit position, trigger ADL', () => {
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
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('should partial transaction and reserve ADL order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            /* increase long position */
            const vaultBefore = await pool.getVault(pairIndex);
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );

            /* increase short position */
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* short decrease position will wait for adl */
            const decreaseLongPositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.LIMIT,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);
            const decreasePosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.order.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
            await executor.connect(keeper.signer).setPricesAndExecuteADLOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                pairIndex,
                [
                    {
                        positionKey,
                        sizeAmount: decreaseOrder.order.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                [
                    {
                        orderId: decreaseOrderId,
                        tradeType: TradeType.LIMIT,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.order.sizeAmount.sub(decreaseOrderAdlAfter.order.executedSize),
            );
        });
    });

    describe('liquidate position', () => {
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
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('should no partial transaction', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
                orderManager,
                executor,
                liquidationLogic,
                keeper,
                pool,
                riskReserve,
                oraclePriceFeed,
                indexPriceFeed,
                feeCollector,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('300000', 30);

            /**
             * increase short position
             */
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            let balance = await usdt.balanceOf(trader.address);
            expect(balance).to.be.eq(collateral);

            const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: size,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
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
            const shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
            balance = await usdt.balanceOf(trader.address);
            const reserveBalanceBef = await riskReserve.getReservedAmount(usdt.address);

            expect(balance).to.be.eq('0');
            expect(shortPositionBefore.positionAmount).to.be.eq(size);

            // update maintainMarginRate
            const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['WBTC'];
            const tradingConfigBefore = btcPair.tradingConfig;
            tradingConfigBefore.maintainMarginRate = 15000000;
            await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
            const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

            expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

            // update price
            await updateBTCPrice(testEnv, '36000');

            // calculate pnl、tradingFee
            const pair = await pool.getPair(pairIndex);
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPositionBefore.positionAmount);
            const pnl = indexToStableAmount
                .mul(-1)
                .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                .div(PRICE_PRECISION);
            const sizeDelta = indexToStableAmount.mul(oraclePrice).div(PRICE_PRECISION);
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);

            // calculate riskRate
            const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
            const margin = shortPositionBefore.positionAmount
                .mul(shortPositionBefore.averagePrice)
                .div(PRICE_PRECISION)
                .mul(tradingConfig.maintainMarginRate)
                .div(PERCENTAGE);
            const riskRate = margin.mul(PERCENTAGE).div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte(PERCENTAGE);

            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);

            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    {
                        token: btc.address,
                        updateData: await getUpdateData(testEnv, btc),
                        updateFee: 1,
                        backtrackRound: 0,
                        positionKey: positionKey,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                        sizeAmount: 0,
                    },
                ],
                { value: 1 },
            );

            balance = await usdt.balanceOf(trader.address);
            const reserveBalanceAft = await riskReserve.getReservedAmount(usdt.address);
            const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);

            // calculate totalSettlementAmount
            const totalSettlementAmount = pnl.sub(tradingFee);

            expect(balance).to.be.eq(0);
            expect(reserveBalanceAft).to.be.eq(
                reserveBalanceBef.add(shortPositionBefore.collateral.sub(totalSettlementAmount.abs())),
            );
            expect(shortPositionAfter.positionAmount).to.be.eq('0');
        });
    });

    describe('oracle price > keeper price 0.5%, exceed max price deviation', () => {
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
            const indexAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('should cancel transaction', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                pool,
                poolView,
                orderManager,
                executor,
                oraclePriceFeed,
                indexPriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, vaultBefore.indexTotalAmount);
            expect(indexToStableAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balance = await usdt.balanceOf(trader.address);
            expect(balance).to.be.eq(collateral);

            /* increase long position */
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrderBefor = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrderBefor.order.executedSize).to.be.eq(longPosition.positionAmount);

            /* increase short position */
            const vaultAfter = await pool.getVault(pairIndex);
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);
            const stableToIndexAmount = await convertStableAmountToIndex(btc, usdt, availableStable);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    stableToIndexAmount.mul(PRICE_PRECISION).div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.order.executedSize).to.be.eq(shortPosition.positionAmount);

            // add liquidity
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const totoalApplyBefore = await lpToken.totalSupply();
            const indexAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const expectAddLiquidity = await poolView.getMintLpAmount(
                pairIndex,
                indexAmount,
                stableAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            await router
                .connect(trader.signer)
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
                    [0],
                    { value: 1 },
                );
            const totoalApplyAfter = await lpToken.totalSupply();

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);

            // update oracle price
            const latestOraclePrice = ethers.utils.parseUnits('30200', 8);
            const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
            const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
            const fee = mockPyth.getUpdateFee(updateData);
            await oraclePriceFeed
                .connect(keeper.signer)
                .updatePrice(
                    [btc.address],
                    [new ethers.utils.AbiCoder().encode(['uint256'], [latestOraclePrice])],
                    [0],
                    {
                        value: fee,
                    },
                );
            const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
            const indexPrice = await indexPriceFeed.getPrice(btc.address);
            const tradingConfig = await pool.getTradingConfig(pairIndex);

            // oraclePrice > indexPrice 0.5%
            expect(oraclePrice.sub(indexPrice).mul(PERCENTAGE).div(oraclePrice)).to.be.gte(
                tradingConfig.maxPriceDeviationP,
            );

            // keeper execute order
            const tx_long = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: longOrderId,
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
            let reason = await extraHash(tx_long.hash, 'ExecuteOrderError', 'errorMessage');
            expect(reason).to.be.eq('exceed max price deviation');

            const tx_short = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            reason = await extraHash(tx_short.hash, 'ExecuteOrderError', 'errorMessage');
            expect(reason).to.be.eq('exceed max price deviation');
        });
    });

    describe('oracle price < keeper price 0.5%, not reach trigger price', () => {
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
            const indexAmount = ethers.utils.parseUnits('100', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                    [0],
                    { value: 1 },
                );
        });

        it('should cancel transaction', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                pool,
                poolView,
                orderManager,
                executor,
                oraclePriceFeed,
                indexPriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, vaultBefore.indexTotalAmount);
            expect(indexToStableAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balance = await usdt.balanceOf(trader.address);
            expect(balance).to.be.eq(collateral);

            /* increase long position */
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.LIMIT,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrderBefor = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrderBefor.order.executedSize).to.be.eq(longPosition.positionAmount);

            /* increase short position */
            const vaultAfter = await pool.getVault(pairIndex);
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
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
                [0],
                [
                    {
                        orderId: shortOrderId,
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
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);
            const stableToIndexAmount = await convertStableAmountToIndex(btc, usdt, availableStable);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    stableToIndexAmount.mul(PRICE_PRECISION).div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.order.executedSize).to.be.eq(shortPosition.positionAmount);

            // add liquidity
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const totoalApplyBefore = await lpToken.totalSupply();
            const indexAmount = ethers.utils.parseUnits('3000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const expectAddLiquidity = await poolView.getMintLpAmount(
                pairIndex,
                indexAmount,
                stableAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            await router
                .connect(trader.signer)
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
                    [0],
                    { value: 1 },
                );
            const totoalApplyAfter = await lpToken.totalSupply();

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);

            // update oracle price
            const latestOraclePrice = ethers.utils.parseUnits('30150', 8);
            const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
            const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
            const fee = mockPyth.getUpdateFee(updateData);
            await oraclePriceFeed
                .connect(keeper.signer)
                .updatePrice(
                    [btc.address],
                    [new ethers.utils.AbiCoder().encode(['uint256'], [latestOraclePrice])],
                    [0],
                    {
                        value: fee,
                    },
                );
            const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
            const indexPrice = await indexPriceFeed.getPrice(btc.address);
            const tradingConfig = await pool.getTradingConfig(pairIndex);

            // oraclePrice < indexPrice 0.5%
            expect(indexPrice.sub(oraclePrice).mul(PERCENTAGE).div(oraclePrice)).to.be.lt(
                tradingConfig.maxPriceDeviationP,
            );

            // keeper execute order
            const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: longOrderId,
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
            const reason = await extraHash(tx.hash, 'ExecuteOrderError', 'errorMessage');

            expect(reason).to.be.eq('not reach trigger price');
        });
    });
});
