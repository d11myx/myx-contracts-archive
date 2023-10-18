import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove, decreasePosition, increasePosition } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Trade: ioc', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('increase market order', () => {
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
            const indexAmount = ethers.utils.parseUnits('100', 18);
            const stableAmount = ethers.utils.parseUnits('3000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('all complete, delete order', async () => {
            const {
                users: [, trader],
                keeper,
                usdt,
                router,
                positionManager,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('50', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

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
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(positionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const marketOrder = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(position.positionAmount).to.be.eq(sizeAmount);
            expect(marketOrder.sizeAmount).to.be.eq('0');
        });

        it('partially complete, delete order', async () => {
            const {
                users: [depositor, , trader],
                keeper,
                usdt,
                router,
                positionManager,
                pool,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('50', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('200000');

            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(depositor.signer)
                .removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

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
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(positionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const marketOrder = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(position.positionAmount).to.be.lt(sizeAmount);
            expect(marketOrder.sizeAmount).to.be.eq('0');
        });
    });

    describe('decrease market order', () => {
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

        it('decrease position size exceed max config, delete order', async () => {
            const {
                users: [depositor, trader],
                usdt,
                router,
                positionManager,
                orderManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', 18);
            const sizeAmount = ethers.utils.parseUnits('6000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('239000000');

            // increase position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                sizeAmount,
                TradeType.MARKET,
                true,
            );

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                sizeAmount,
                TradeType.MARKET,
                true,
            );
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBefore.positionAmount).to.be.eq(sizeAmount.mul(2));

            // remove liquidity
            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(depositor.signer)
                .removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

            const { orderId } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                positionBefore.positionAmount,
                TradeType.MARKET,
                true,
            );

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAfter.positionAmount).to.be.eq('2000000000000000000000');

            const marketOrder = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);
            expect(marketOrder.sizeAmount).to.be.eq('0');
        });
    });

    describe('increase limit order', () => {
        let orderId = BigNumber.from('0');

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
            const indexAmount = ethers.utils.parseUnits('100', 18);
            const stableAmount = ethers.utils.parseUnits('3000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('all complete, delete order', async () => {
            const {
                users: [, trader],
                keeper,
                usdt,
                router,
                positionManager,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('50', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

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
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(positionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.LIMIT, 0, 0);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const limitOrder = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);

            expect(position.positionAmount).to.be.eq(sizeAmount);
            expect(limitOrder.sizeAmount).to.be.eq('0');
        });

        it('partially complete, reserve order', async () => {
            const {
                users: [depositor, , trader],
                keeper,
                usdt,
                router,
                positionManager,
                pool,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('300000', 18);
            const sizeAmount = ethers.utils.parseUnits('50', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('200000');

            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(depositor.signer)
                .removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

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
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(positionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.LIMIT, 0, 0);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const limitOrder = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);

            expect(position.positionAmount).to.be.lt(sizeAmount);
            expect(limitOrder.sizeAmount).to.be.eq(sizeAmount);
        });

        it('add liquidity, complete remaining positions, delete order', async () => {
            const {
                users: [depositor, , trader],
                keeper,
                btc,
                usdt,
                router,
                positionManager,
                pool,
                orderManager,
                executionLogic,
            } = testEnv;

            const sizeAmount = ethers.utils.parseUnits('50', 18);
            const indexAmount = ethers.utils.parseUnits('100', 18);
            const stableAmount = ethers.utils.parseUnits('3000000', 18);

            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            await executionLogic
                .connect(keeper.signer)
                .executeIncreaseLimitOrders([{ orderId, level: 0, commissionRatio: 0 }]);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const limitOrder = await orderManager.getIncreaseOrder(orderId, TradeType.LIMIT);

            expect(position.positionAmount).to.be.eq(sizeAmount);
            expect(limitOrder.sizeAmount).to.be.eq('0');
        });
    });

    describe('decrease limit order', () => {
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

        it('decrease position size exceed max config, reserve order', async () => {
            const {
                users: [depositor, trader],
                usdt,
                router,
                positionManager,
                orderManager,
                pool,
                executionLogic,
                keeper,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000000', 18);
            const sizeAmount = ethers.utils.parseUnits('6000', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const removeAmount = ethers.utils.parseEther('239000000');

            // increase position
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
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionBefore.positionAmount).to.be.eq(sizeAmount.mul(2));

            // remove liquidity
            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);
            await poolToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(depositor.signer)
                .removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

            const { orderId } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                positionBefore.positionAmount,
                TradeType.LIMIT,
                true,
            );

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAfter.positionAmount).to.be.eq('2000000000000000000000');

            let limitOrder = await orderManager.getDecreaseOrder(orderId, TradeType.LIMIT);
            expect(limitOrder.executedSize).to.be.eq('10000000000000000000000');

            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(orderId, TradeType.LIMIT, 0, 0, false, 0, false);
            limitOrder = await orderManager.getDecreaseOrder(orderId, TradeType.LIMIT);

            expect(limitOrder.sizeAmount).to.be.eq('0');
        });
    });
});
