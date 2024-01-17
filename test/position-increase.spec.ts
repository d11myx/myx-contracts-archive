import { newTestEnv, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { TradeType, ZERO_ADDRESS, loadReserveConfig, MARKET_NAME } from '../helpers';
import { extraHash, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE, PRICE_PRECISION } from './helpers/constants';

describe('Trade: increase position', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('trade collateral', () => {
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

        it('collateral = 0, exceeds max leverage', async () => {
            const {
                users: [trader],
                btc,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
            const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
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

            expect(reason).to.be.eq('exceeds max leverage');

            // cancel order
            const orderAfter = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(orderAfter.order.sizeAmount).to.be.eq('0');
        });

        it('use residual collateral, open position success', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
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
                        orderId,
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            // use residual collateral open position
            const positionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest2);

            // execution order
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
                        orderId,
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
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.add(sizeAmount));
        });

        it('use residual collateral, exceeds max leverage', async () => {
            const {
                users: [, trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
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
                        orderId,
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            // use residual collateral open position
            const positionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest2);

            // execution order
            const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
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

            expect(reason).to.be.eq('exceeds max leverage');

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
            const order = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount);
            expect(order.order.sizeAmount).to.be.eq('0');
        });
    });

    describe('trade amount', () => {
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

            // update trading config
            const pairConfig = loadReserveConfig(MARKET_NAME).PairsConfig['WBTC'];
            const tradingConfig = pairConfig.tradingConfig;
            tradingConfig.minTradeAmount = ethers.utils.parseUnits('0.03', 8);
            tradingConfig.maxTradeAmount = ethers.utils.parseUnits('35', 8);
            tradingConfig.maxPositionAmount = ethers.utils.parseUnits('35', 8);

            await pool.updateTradingConfig(pairIndex, tradingConfig);
        });

        it('trade amount = 0, zero position amount', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('0', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await orderManager.ordersIndex();
            await expect(router.connect(trader.signer).createIncreaseOrder(positionRequest)).to.be.revertedWith(
                'zero position amount',
            );

            const order = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(order.order.sizeAmount).to.be.eq('0');
        });

        it('trade amount < min trade amount', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('0.02', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await orderManager.ordersIndex();
            await expect(router.connect(trader.signer).createIncreaseOrder(positionRequest)).to.be.revertedWith(
                'invalid trade size',
            );

            const order = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(order.order.sizeAmount).to.be.eq('0');
        });

        it('trade amount > max trade amount', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('36', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await orderManager.ordersIndex();
            await expect(router.connect(trader.signer).createIncreaseOrder(positionRequest)).to.be.revertedWith(
                'invalid trade size',
            );

            const order = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(order.order.sizeAmount).to.be.eq('0');
        });

        it('user position amount > max position amount', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('60000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('35', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
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
                        orderId,
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            // use residual collateral open position
            const positionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            orderId = await orderManager.ordersIndex();

            await expect(router.connect(trader.signer).createIncreaseOrder(positionRequest2)).to.be.revertedWith(
                'exceeds max position',
            );

            const order = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(order.order.sizeAmount).to.be.eq('0');
        });
    });

    describe('trade price', () => {
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

        it('trade type = limit and open price = 0, not reach trigger price', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('60000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('0', 30);

            // increase short position
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
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

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

            const order = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);
            expect(order.order.sizeAmount).to.be.eq('0');
        });

        it('trade type = market and open price = 0, average price = current price', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('60000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('0', 30);

            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
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
                        orderId,
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
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const oraclePrice = await oraclePriceFeed.getPrice(btc.address);

            expect(position.positionAmount).to.be.eq(sizeAmount);
            expect(position.averagePrice).to.be.eq(oraclePrice);
        });

        it('trade type = market, update position average price', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('60000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('40000', 30);

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            // increase long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
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
                        orderId,
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
            const averagePrice = positionBefore.positionAmount
                .mul(positionBefore.averagePrice)
                .div(PRICE_PRECISION)
                .add(sizeAmount.mul(openPrice).div(PRICE_PRECISION))
                .mul(PRICE_PRECISION)
                .div(positionBefore.positionAmount.add(sizeAmount));

            expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.add(sizeAmount));
            expect(positionAfter.averagePrice).to.be.eq(averagePrice);
        });
    });
});
