import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';
import { MARKET_NAME } from '../helpers/env';
import { loadReserveConfig } from '../helpers/market-config-helper';

describe('Trade: ioc', () => {
    const pairIndex = 0;
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', 18);
            const stableAmount = ethers.utils.parseUnits('30000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('illiquidity, should partial transaction and delete order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                router,
                positionManager,
                pool,
                orderManager,
                executionLogic,
                oraclePriceFeed,
                btc,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', 18);
            const sizeAmount = ethers.utils.parseUnits('3000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

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
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrder = await orderManager.getIncreaseOrder(longOrderId, TradeType.MARKET);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrder.sizeAmount).to.be.eq('0');

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
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.MARKET);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    availableStable.mul('1000000000000000000000000000000').div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.sizeAmount).to.be.eq('0');
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', 18);
            const stableAmount = ethers.utils.parseUnits('30000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('illiquidity, should partial transaction and reserve order', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                router,
                positionManager,
                pool,
                orderManager,
                executionLogic,
                oraclePriceFeed,
                btc,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('3000000', 18);
            const sizeAmount = ethers.utils.parseUnits('3000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            // 50:50
            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);

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
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.LIMIT, 0, 0);
            const longPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const longOrderBefor = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);

            // partial transaction
            expect(longPosition.positionAmount).to.be.eq(
                vaultBefore.indexTotalAmount.sub(vaultBefore.indexReservedAmount),
            );
            expect(longOrderBefor.executedSize).to.be.eq(longPosition.positionAmount);

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
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.LIMIT, 0, 0);
            const shortOrder = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);
            const shortPosition = await positionManager.getPosition(trader.address, pairIndex, false);
            const availableStable = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

            // partial transaction
            expect(shortPosition.positionAmount).to.be.eq(
                vaultAfter.indexReservedAmount.add(
                    availableStable.mul('1000000000000000000000000000000').div(shortPosition.averagePrice),
                ),
            );
            expect(shortOrder.executedSize).to.be.eq(shortPosition.positionAmount);

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', 18);
            const stableAmount = ethers.utils.parseUnits('30000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            await router
                .connect(trader.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            // keeper execute order
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.LIMIT, 0, 0);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.LIMIT, 0, 0);
            const longOrderAfter = await orderManager.getIncreaseOrder(longOrderId, TradeType.LIMIT);
            const shortOrderAfter = await orderManager.getIncreaseOrder(shortOrderId, TradeType.LIMIT);

            expect(longOrderAfter.sizeAmount).to.be.eq('0');
            expect(shortOrderAfter.sizeAmount).to.be.eq('0');
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('20000', 18);
            const stableAmount = ethers.utils.parseUnits('3000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('size exceed max config, should partial transaction and delete order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('30000000', 18);
            const sizeAmount = ethers.utils.parseUnits('6000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('239000000');

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
            };
            let increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET, 0, 0);
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
            };
            increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(long2PositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET, 0, 0);
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.positionAmount).to.be.eq(sizeAmount.add(positionBefore.positionAmount));

            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(trader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(trader.signer).removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

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
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const decreasePositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePositionAfter.positionAmount).to.be.eq(
                positionAfter.positionAmount.sub(tradingConfig.maxTradeAmount),
            );
            expect(decreaseOrder.sizeAmount).to.be.eq('0');
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('20000', 18);
            const stableAmount = ethers.utils.parseUnits('3000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('size exceed max config, should partial transaction and reserve order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('30000000', 18);
            const sizeAmount = ethers.utils.parseUnits('6000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('239000000');

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
            };
            let increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.LIMIT, 0, 0);
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
            };
            increaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(long2PositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.LIMIT, 0, 0);
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(positionAfter.positionAmount).to.be.eq(sizeAmount.add(positionBefore.positionAmount));

            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(trader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(trader.signer).removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

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
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.LIMIT, 0, 0, false, 0, false);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);

            const tradingConfig = await pool.getTradingConfig(pairIndex);
            let decreasePositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePositionAfter.positionAmount).to.be.eq(
                positionAfter.positionAmount.sub(tradingConfig.maxTradeAmount),
            );
            expect(decreaseOrder.executedSize).to.be.eq(
                positionAfter.positionAmount.sub(decreasePositionAfter.positionAmount),
            );

            // execute ADL
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.LIMIT, 0, 0, false, 0, false);
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', 18);
            const stableAmount = ethers.utils.parseUnits('30000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should partial transaction and reserve ADL order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', 18);
            const sizeAmount = ethers.utils.parseUnits('1000', 18);
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
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
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
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
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
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                decreaseOrderId,
                TradeType.MARKET,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', 18);
            const stableAmount = ethers.utils.parseUnits('30000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should partial transaction and reserve ADL order', async () => {
            const {
                users: [trader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', 18);
            const sizeAmount = ethers.utils.parseUnits('1000', 18);
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
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.LIMIT, 0, 0);
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
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.LIMIT, 0, 0);
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
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreaseLongPositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.LIMIT, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);
            const decreasePosition = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                decreaseOrderId,
                TradeType.LIMIT,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.LIMIT);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
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
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should no partial transaction', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
                orderManager,
                executionLogic,
                liquidationLogic,
                keeper,
                pool,
                riskReserve,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('300000', 18);
            const size = ethers.utils.parseUnits('30', 18);
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
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            const shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
            balance = await usdt.balanceOf(trader.address);
            const reserveBalanceBef = await riskReserve.getReservedAmount(usdt.address);

            expect(balance).to.be.eq('0');
            expect(shortPositionBefore.positionAmount).to.be.eq(size);

            // update maintainMarginRate
            const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
            const tradingConfigBefore = btcPair.tradingConfig;
            tradingConfigBefore.maintainMarginRate = 15000000;
            await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
            const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

            expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

            // update price and liquidatePositions
            await updateBTCPrice(testEnv, '36000');
            const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
            await liquidationLogic.connect(keeper.signer).liquidatePositions([positionKey]);

            balance = await usdt.balanceOf(trader.address);
            const reserveBalanceAft = await riskReserve.getReservedAmount(usdt.address);
            const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);

            // calculate totalSettlementAmount
            const pair = await pool.getPair(pairIndex);
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const oraclePrice = await pool.getPrice(pair.indexToken);
            const pnl = shortPositionBefore.positionAmount
                .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = shortPositionBefore.positionAmount
                .mul(oraclePrice)
                .div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');
            const totalSettlementAmount = pnl.add(tradingFee);

            expect(balance).to.be.eq(0);
            expect(reserveBalanceAft).to.be.eq(
                reserveBalanceBef.add(shortPositionBefore.collateral.sub(totalSettlementAmount)),
            );
            expect(shortPositionAfter.positionAmount).to.be.eq('0');
        });
    });
});
