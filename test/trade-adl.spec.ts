import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, getMockToken } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Trade: adl', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('exposure long, B > LP USDT total / price + A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should decrease long position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            /* long decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
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

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short, B > LP USDT total / price + A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should decrease long position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            /* long decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
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

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long, B > LP BTC total - A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should decrease short position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('600', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('30000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            /* short decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: false,
                sizeAmount: shortPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(decreasePosition.positionAmount).to.be.eq(shortPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
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

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short, B > LP BTC total - A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should decrease short position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            /* short decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: false,
                sizeAmount: shortPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executionLogic
                .connect(keeper.signer)
                .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(decreasePosition.positionAmount).to.be.eq(shortPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
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

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long user increase long position, B > LP USDT total / price + A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
                liquidationLogic,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '28000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await liquidationLogic
                .connect(keeper.signer)
                .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);
            const orders = await orderManager.getPositionOrders(positionKey);

            // execute ADL
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: orders[0].sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                orders[0].orderId,
                TradeType.MARKET,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short user increase long position, B > LP USDT total / price + A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
                liquidationLogic,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '28000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await liquidationLogic
                .connect(keeper.signer)
                .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);
            const orders = await orderManager.getPositionOrders(positionKey);

            // execute ADL
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: orders[0].sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                orders[0].orderId,
                TradeType.MARKET,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long user increase short position, B > BTC total - A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                liquidationLogic,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '32000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await liquidationLogic
                .connect(keeper.signer)
                .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);
            const orders = await orderManager.getPositionOrders(positionKey);

            // execute ADL
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: orders[0].sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                orders[0].orderId,
                TradeType.MARKET,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short user increase short position, B > BTC total - A', () => {
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
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                liquidationLogic,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router.connect(longTrader.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '32000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await liquidationLogic
                .connect(keeper.signer)
                .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);
            const orders = await orderManager.getPositionOrders(positionKey);

            // execute ADL
            await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                [
                    {
                        positionKey,
                        sizeAmount: orders[0].sizeAmount,
                        level: 0,
                        commissionRatio: 0,
                    },
                ],
                orders[0].orderId,
                TradeType.MARKET,
                0,
                0,
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });
});
