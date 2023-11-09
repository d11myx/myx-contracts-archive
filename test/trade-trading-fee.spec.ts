import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, decreasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, convertIndexAmountToStable, PERCENTAGE, PRICE_PRECISION } from '../helpers';
import { BigNumber } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Trade: trading fee', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('open and close position', () => {
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
            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('user increase position, should pay trading fee', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balanceBefore = await usdt.balanceOf(trader.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const balanceAfter = await usdt.balanceOf(trader.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));
        });

        it('user decrease position, should pay trading fee', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                positionManager,
                pool,
            } = testEnv;

            const openPrice = ethers.utils.parseUnits('30000', 30);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);

            // trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                position.positionAmount,
                TradeType.MARKET,
                true,
            );
            const balanceAfter = await usdt.balanceOf(trader.address);

            expect(balanceAfter).to.be.eq(position.collateral.sub(tradingFee));
        });

        it('user partial liquidation, should pay trading fee form unrealized pnl', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balanceBefore = await usdt.balanceOf(trader.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            const increaseBalanceAfter = await usdt.balanceOf(trader.address);

            expect(increaseBalanceAfter).to.be.eq('0');
            expect(positionBefore.positionAmount).to.be.eq(size);

            // trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDeltaBefore = await convertIndexAmountToStable(
                btc,
                usdt,
                positionBefore.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeBefore = indexToStableDeltaBefore.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(positionBefore.collateral).to.be.eq(balanceBefore.sub(tradingFeeBefore));

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            const decreaseAmount = positionBefore.positionAmount.div(2);
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                decreaseAmount,
                TradeType.MARKET,
                true,
            );
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            // pnl
            const pair = await pool.getPair(pairIndex);
            const oraclePrice = await pool.getPrice(pair.indexToken);
            const indexToStableAmountAfter = await convertIndexAmountToStable(btc, usdt, decreaseAmount);
            const pnl = indexToStableAmountAfter
                .mul(oraclePrice.sub(positionAfter.averagePrice))
                .div('1000000000000000000000000000000');

            // trading fee
            const indexToStableDeltaAfter = await convertIndexAmountToStable(
                btc,
                usdt,
                decreaseAmount.mul(oraclePrice).div(PRICE_PRECISION),
            );
            const tradingFeeAfter = indexToStableDeltaAfter.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // totalSettlementAmount
            const totalSettlementAmount = pnl.sub(tradingFeeAfter);

            expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.add(totalSettlementAmount.abs()));
        });

        it('user partial liquidation, should pay trading fee form collateral', async () => {
            const {
                users: [, , trader],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('35000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balanceBefore = await usdt.balanceOf(trader.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            const increaseBalanceAfter = await usdt.balanceOf(trader.address);

            expect(increaseBalanceAfter).to.be.eq('0');
            expect(positionBefore.positionAmount).to.be.eq(size);

            // trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDeltaBefore = await convertIndexAmountToStable(
                btc,
                usdt,
                positionBefore.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeBefore = indexToStableDeltaBefore.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(positionBefore.collateral).to.be.eq(balanceBefore.sub(tradingFeeBefore));

            const decreaseAmount = positionBefore.positionAmount.div(2);
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                decreaseAmount,
                TradeType.MARKET,
                true,
            );
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const indexToStableDeltaAfter = await convertIndexAmountToStable(
                btc,
                usdt,
                decreaseAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFeeAfter = indexToStableDeltaAfter.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(tradingFeeAfter));
        });
    });

    describe('trading fee type', () => {
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
            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('long > short, user open long position pay taker trading fee', async () => {
            const {
                users: [trader, trader2],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // init platform long position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            // longTracker > shortTracker
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // user open long
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const balanceBefore = await usdt.balanceOf(trader2.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader2, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const position = await positionManager.getPosition(trader2.address, pairIndex, true);
            const balanceAfter = await usdt.balanceOf(trader2.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // taker trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));
        });

        it('long > short, user open short position pay maker trading fee', async () => {
            const {
                users: [, trader2],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // longTracker > shortTracker
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // user open long
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const balanceBefore = await usdt.balanceOf(trader2.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader2, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);
            const position = await positionManager.getPosition(trader2.address, pairIndex, false);
            const balanceAfter = await usdt.balanceOf(trader2.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // maker trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDeltaBefore = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDeltaBefore.mul(tradingFeeConfig.makerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));
        });

        it('long < short, user open short position pay taker trading fee', async () => {
            const {
                users: [, , trader2],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // longTracker < shortTracker
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.lt(shortTracker);

            // user open short
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const balanceBefore = await usdt.balanceOf(trader2.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader2, pairIndex, collateral, openPrice, size, TradeType.MARKET, false);
            const position = await positionManager.getPosition(trader2.address, pairIndex, false);
            const balanceAfter = await usdt.balanceOf(trader2.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // taker trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));
        });

        it('long < short, user open long position pay maker trading fee', async () => {
            const {
                users: [, , trader2],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // longTracker < shortTracker
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.lt(shortTracker);

            // user open short
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const balanceBefore = await usdt.balanceOf(trader2.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader2, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const position = await positionManager.getPosition(trader2.address, pairIndex, true);
            const balanceAfter = await usdt.balanceOf(trader2.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // taker trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.makerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));
        });
    });

    describe('distribute trading fee', () => {
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
            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should distribute trading fee', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                positionManager,
                pool,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // user open long
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const balanceBefore = await usdt.balanceOf(trader.address);

            expect(balanceBefore).to.be.eq(collateral);

            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const balanceAfter = await usdt.balanceOf(trader.address);

            expect(balanceAfter).to.be.eq('0');
            expect(position.positionAmount).to.be.eq(size);

            // taker trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const indexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const tradingFee = indexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(position.collateral).to.be.eq(balanceBefore.sub(tradingFee));

            // vip fee
            const vipLevel = 0;
            const vipFee = tradingFee.mul(vipLevel).div(PERCENTAGE);

            // referral fee
            const referenceRate = 0;
            const surplusFee = tradingFee.sub(vipFee);
            const referralsFee = surplusFee.mul(referenceRate).div(PERCENTAGE);

            // keeper fee
            const keeperFee = surplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);

            // lp fee
            const lpFee = surplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);

            // staking fee
            const stakingFee = surplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);

            // treasury fee
            const distributorAmount = surplusFee.sub(referralsFee).sub(lpFee).sub(keeperFee).sub(stakingFee);
            const treasuryFee = distributorAmount.add(referralsFee);

            expect(tradingFee).to.be.eq(
                vipFee.add(referralsFee).add(keeperFee).add(lpFee).add(stakingFee).add(treasuryFee),
            );
        });
    });

    describe('vip trading fee', () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                feeCollector,
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            // config levels
            await feeCollector.updateLevelDiscountRatio(1, { takerDiscountRatio: 1e6, makerDiscountRatio: 1e6 });
            await feeCollector.updateLevelDiscountRatio(2, { takerDiscountRatio: 2e6, makerDiscountRatio: 2e6 });
            await feeCollector.updateLevelDiscountRatio(3, { takerDiscountRatio: 3e6, makerDiscountRatio: 3e6 });
            await feeCollector.updateLevelDiscountRatio(4, { takerDiscountRatio: 4e6, makerDiscountRatio: 4e6 });
            await feeCollector.updateLevelDiscountRatio(5, { takerDiscountRatio: 5e6, makerDiscountRatio: 5e6 });
            await feeCollector.updateLevelDiscountRatio(6, { takerDiscountRatio: 6e6, makerDiscountRatio: 6e6 });
        });

        it('should received vip trading fee', async () => {
            const {
                users: [trader, trader2, trader3, trader4, trader5, trader6],
                usdt,
                btc,
                router,
                positionManager,
                executionLogic,
                orderManager,
                pool,
                keeper,
                feeCollector,
            } = testEnv;

            const normal = 0;
            const vip1 = 1;
            const vip2 = 2;
            const vip3 = 3;
            const vip4 = 4;
            const vip5 = 5;
            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('30', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // vip = 0
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const traderBalanceBefore = await usdt.balanceOf(trader.address);

            expect(traderBalanceBefore).to.be.eq(collateral);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, normal, 0);
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const traderBalanceAfter = await usdt.balanceOf(trader.address);

            expect(traderBalanceAfter).to.be.eq('0');
            expect(traderPosition.positionAmount).to.be.eq(sizeAmount);

            // vip = 1
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const trader2BalanceBefore = await usdt.balanceOf(trader2.address);

            expect(trader2BalanceBefore).to.be.eq(collateral);

            const increasePositionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrder(increasePositionRequest2);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip1, 0);
            const trader2Position = await positionManager.getPosition(trader2.address, pairIndex, true);
            const trader2BalanceAfter = await usdt.balanceOf(trader.address);

            expect(trader2BalanceAfter).to.be.eq('0');
            expect(trader2Position.positionAmount).to.be.eq(sizeAmount);

            // vip = 2
            await mintAndApprove(testEnv, usdt, collateral, trader3, router.address);
            const trader3BalanceBefore = await usdt.balanceOf(trader3.address);

            expect(trader3BalanceBefore).to.be.eq(collateral);

            const increasePositionRequest3: TradingTypes.IncreasePositionRequestStruct = {
                account: trader3.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader3.signer).createIncreaseOrder(increasePositionRequest3);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip2, 0);
            const trader3Position = await positionManager.getPosition(trader3.address, pairIndex, true);
            const trader3BalanceAfter = await usdt.balanceOf(trader3.address);

            expect(trader3BalanceAfter).to.be.eq('0');
            expect(trader3Position.positionAmount).to.be.eq(sizeAmount);

            // vip = 3
            await mintAndApprove(testEnv, usdt, collateral, trader4, router.address);
            const trader4BalanceBefore = await usdt.balanceOf(trader4.address);

            expect(trader4BalanceBefore).to.be.eq(collateral);

            const increasePositionRequest4: TradingTypes.IncreasePositionRequestStruct = {
                account: trader4.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader4.signer).createIncreaseOrder(increasePositionRequest4);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip3, 0);
            const trader4Position = await positionManager.getPosition(trader4.address, pairIndex, true);
            const trader4BalanceAfter = await usdt.balanceOf(trader4.address);

            expect(trader4BalanceAfter).to.be.eq('0');
            expect(trader4Position.positionAmount).to.be.eq(sizeAmount);

            // vip = 4
            await mintAndApprove(testEnv, usdt, collateral, trader5, router.address);
            const trader5BalanceBefore = await usdt.balanceOf(trader5.address);

            expect(trader5BalanceBefore).to.be.eq(collateral);

            const increasePositionRequest5: TradingTypes.IncreasePositionRequestStruct = {
                account: trader5.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader5.signer).createIncreaseOrder(increasePositionRequest5);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip4, 0);
            const trader5Position = await positionManager.getPosition(trader5.address, pairIndex, true);
            const trader5BalanceAfter = await usdt.balanceOf(trader5.address);

            expect(trader5BalanceAfter).to.be.eq('0');
            expect(trader5Position.positionAmount).to.be.eq(sizeAmount);

            // vip = 5
            await mintAndApprove(testEnv, usdt, collateral, trader6, router.address);
            const trader6BalanceBefore = await usdt.balanceOf(trader6.address);

            expect(trader6BalanceBefore).to.be.eq(collateral);

            const increasePositionRequest6: TradingTypes.IncreasePositionRequestStruct = {
                account: trader6.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader6.signer).createIncreaseOrder(increasePositionRequest6);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip5, 0);
            const trader6Position = await positionManager.getPosition(trader6.address, pairIndex, true);
            const trader6BalanceAfter = await usdt.balanceOf(trader6.address);

            expect(trader6BalanceAfter).to.be.eq('0');
            expect(trader6Position.positionAmount).to.be.eq(sizeAmount);

            // long > short
            const longTracker = await positionManager.longTracker(pairIndex);
            const shortTracker = await positionManager.shortTracker(pairIndex);

            expect(longTracker).to.be.gt(shortTracker);

            // trader trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const traderIndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                traderPosition.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const traderTradingFee = traderIndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(traderPosition.collateral).to.be.eq(traderBalanceBefore.sub(traderTradingFee));

            // trader2 trading fee
            const trader2IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader2Position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const trader2TradingFee = trader2IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(trader2Position.collateral).to.be.eq(trader2BalanceBefore.sub(trader2TradingFee));

            // trader3 trading fee
            const trader3IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader3Position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const trader3TradingFee = trader3IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(trader3Position.collateral).to.be.eq(trader3BalanceBefore.sub(trader3TradingFee));

            // trader4 trading fee
            const trader4IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader4Position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const trader4TradingFee = trader4IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(trader4Position.collateral).to.be.eq(trader4BalanceBefore.sub(trader4TradingFee));

            // trader5 trading fee
            const trader5IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader5Position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const trader5TradingFee = trader5IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(trader5Position.collateral).to.be.eq(trader5BalanceBefore.sub(trader5TradingFee));

            // trader6 trading fee
            const trader6IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader6Position.positionAmount.mul(openPrice).div(PRICE_PRECISION),
            );
            const trader6TradingFee = trader6IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            expect(trader6Position.collateral).to.be.eq(trader6BalanceBefore.sub(trader6TradingFee));

            // trader vip fee
            let levelDiscountRatios = await feeCollector.levelDiscounts(normal);
            const normalVipFee = traderTradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip1 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip1);
            const vip1Fee = trader2TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip2 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip2);
            const vip2Fee = trader3TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip3 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip3);
            const vip3Fee = trader4TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip4 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip4);
            const vip4Fee = trader5TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip5 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip5);
            const vip5Fee = trader6TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            const traderVipFee = await feeCollector.userTradingFee(trader.address);
            const trader2VipFee = await feeCollector.userTradingFee(trader2.address);
            const trader3VipFee = await feeCollector.userTradingFee(trader3.address);
            const trader4VipFee = await feeCollector.userTradingFee(trader4.address);
            const trader5VipFee = await feeCollector.userTradingFee(trader5.address);
            const trader6VipFee = await feeCollector.userTradingFee(trader6.address);

            expect(normalVipFee).to.be.eq(traderVipFee);
            expect(vip1Fee).to.be.eq(trader2VipFee);
            expect(vip2Fee).to.be.eq(trader3VipFee);
            expect(vip3Fee).to.be.eq(trader4VipFee);
            expect(vip4Fee).to.be.eq(trader5VipFee);
            expect(vip5Fee).to.be.eq(trader6VipFee);
        });

        it('claim trading fee', async () => {
            const {
                users: [trader, trader2, trader3, trader4, trader5, trader6, poolAdmin],
                usdt,
                btc,
                positionManager,
                keeper,
                roleManager,
                feeCollector,
                pool,
                oraclePriceFeed,
            } = testEnv;

            const normal = 0;
            const vip1 = 1;
            const vip2 = 2;
            const vip3 = 3;
            const vip4 = 4;
            const vip5 = 5;

            const pair = await pool.getPair(pairIndex);
            const price = await oraclePriceFeed.getPrice(pair.indexToken);

            // user position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const trader2Position = await positionManager.getPosition(trader2.address, pairIndex, true);
            const trader3Position = await positionManager.getPosition(trader3.address, pairIndex, true);
            const trader4Position = await positionManager.getPosition(trader4.address, pairIndex, true);
            const trader5Position = await positionManager.getPosition(trader5.address, pairIndex, true);
            const trader6Position = await positionManager.getPosition(trader6.address, pairIndex, true);

            // before balance
            const keeperBalanceBefore = await usdt.balanceOf(keeper.address);
            const traderBalanceBefore = await usdt.balanceOf(trader.address);
            const trader2BalanceBefore = await usdt.balanceOf(trader2.address);
            const trader3BalanceBefore = await usdt.balanceOf(trader3.address);
            const trader4BalanceBefore = await usdt.balanceOf(trader4.address);
            const trader5BalanceBefore = await usdt.balanceOf(trader5.address);
            const trader6BalanceBefore = await usdt.balanceOf(trader6.address);
            const poolAdminBalanceBefore = await usdt.balanceOf(poolAdmin.address);

            // trader trading fee
            const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
            const traderIndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                traderPosition.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const traderTradingFee = traderIndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // trader2 trading fee
            const trader2IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader2Position.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const trader2TradingFee = trader2IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // trader3 trading fee
            const trader3IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader3Position.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const trader3TradingFee = trader3IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // trader4 trading fee
            const trader4IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader4Position.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const trader4TradingFee = trader4IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // trader5 trading fee
            const trader5IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader5Position.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const trader5TradingFee = trader5IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // trader6 trading fee
            const trader6IndexToStableDelta = await convertIndexAmountToStable(
                btc,
                usdt,
                trader6Position.positionAmount.mul(price).div(PRICE_PRECISION),
            );
            const trader6TradingFee = trader6IndexToStableDelta.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);

            // normal fee
            let levelDiscountRatios = await feeCollector.levelDiscounts(normal);
            const normalVipFee = traderTradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip1 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip1);
            const vip1Fee = trader2TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip2 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip2);
            const vip2Fee = trader3TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip3 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip3);
            const vip3Fee = trader4TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip4 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip4);
            const vip4Fee = trader5TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // vip5 fee
            levelDiscountRatios = await feeCollector.levelDiscounts(vip5);
            const vip5Fee = trader6TradingFee.mul(levelDiscountRatios.takerDiscountRatio).div(PERCENTAGE);

            // keeper fee
            const traderSurplusFee = traderTradingFee.sub(normalVipFee);
            const trader2SurplusFee = trader2TradingFee.sub(vip1Fee);
            const trader3SurplusFee = trader3TradingFee.sub(vip2Fee);
            const trader4SurplusFee = trader4TradingFee.sub(vip3Fee);
            const trader5SurplusFee = trader5TradingFee.sub(vip4Fee);
            const trader6SurplusFee = trader6TradingFee.sub(vip5Fee);
            const traderKeeperFee = traderSurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
            const trader2KeeperFee = trader2SurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
            const trader3KeeperFee = trader3SurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
            const trader4KeeperFee = trader4SurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
            const trader5KeeperFee = trader5SurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
            const trader6KeeperFee = trader6SurplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);

            // referral fee
            const referenceRate = 0;
            const traderReferralsFee = traderSurplusFee.mul(referenceRate).div(PERCENTAGE);
            const trader2ReferralsFee = trader2SurplusFee.mul(referenceRate).div(PERCENTAGE);
            const trader3ReferralsFee = trader3SurplusFee.mul(referenceRate).div(PERCENTAGE);
            const trader4ReferralsFee = trader4SurplusFee.mul(referenceRate).div(PERCENTAGE);
            const trader5ReferralsFee = trader5SurplusFee.mul(referenceRate).div(PERCENTAGE);
            const trader6ReferralsFee = trader6SurplusFee.mul(referenceRate).div(PERCENTAGE);

            // lp fee
            const traderLpFee = traderSurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
            const trader2LpFee = trader2SurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
            const trader3LpFee = trader3SurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
            const trader4LpFee = trader4SurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
            const trader5LpFee = trader5SurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
            const trader6LpFee = trader6SurplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);

            // staking fee
            const traderStakingFee = traderSurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
            const trader2StakingFee = trader2SurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
            const trader3StakingFee = trader3SurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
            const trader4StakingFee = trader4SurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
            const trader5StakingFee = trader5SurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
            const trader6StakingFee = trader6SurplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);

            // treasury fee
            const traderDistributorAmount = traderSurplusFee
                .sub(traderReferralsFee)
                .sub(traderLpFee)
                .sub(traderKeeperFee)
                .sub(traderStakingFee);
            const trader2DistributorAmount = trader2SurplusFee
                .sub(trader2ReferralsFee)
                .sub(trader2LpFee)
                .sub(trader2KeeperFee)
                .sub(trader2StakingFee);
            const trader3DistributorAmount = trader3SurplusFee
                .sub(trader3ReferralsFee)
                .sub(trader3LpFee)
                .sub(trader3KeeperFee)
                .sub(trader3StakingFee);
            const trader4DistributorAmount = trader4SurplusFee
                .sub(trader4ReferralsFee)
                .sub(trader4LpFee)
                .sub(trader4KeeperFee)
                .sub(trader4StakingFee);
            const trader5DistributorAmount = trader5SurplusFee
                .sub(trader5ReferralsFee)
                .sub(trader5LpFee)
                .sub(trader5KeeperFee)
                .sub(trader5StakingFee);
            const trader6DistributorAmount = trader6SurplusFee
                .sub(trader6ReferralsFee)
                .sub(trader6LpFee)
                .sub(trader6KeeperFee)
                .sub(trader6StakingFee);
            const traderTreasuryFee = traderDistributorAmount.add(traderReferralsFee);
            const trader2TreasuryFee = trader2DistributorAmount.add(trader2ReferralsFee);
            const trader3TreasuryFee = trader3DistributorAmount.add(trader3ReferralsFee);
            const trader4TreasuryFee = trader4DistributorAmount.add(trader4ReferralsFee);
            const trader5TreasuryFee = trader5DistributorAmount.add(trader5ReferralsFee);
            const trader6TreasuryFee = trader6DistributorAmount.add(trader6ReferralsFee);

            // user claim vip fee
            await feeCollector.connect(trader.signer).claimUserTradingFee();
            await feeCollector.connect(trader2.signer).claimUserTradingFee();
            await feeCollector.connect(trader3.signer).claimUserTradingFee();
            await feeCollector.connect(trader4.signer).claimUserTradingFee();
            await feeCollector.connect(trader5.signer).claimUserTradingFee();
            await feeCollector.connect(trader6.signer).claimUserTradingFee();

            // after balance
            const traderBalanceAfter = await usdt.balanceOf(trader.address);
            const trader2BalanceAfter = await usdt.balanceOf(trader2.address);
            const trader3BalanceAfter = await usdt.balanceOf(trader3.address);
            const trader4BalanceAfter = await usdt.balanceOf(trader4.address);
            const trader5BalanceAfter = await usdt.balanceOf(trader5.address);
            const trader6BalanceAfter = await usdt.balanceOf(trader6.address);

            expect(traderBalanceBefore.add(normalVipFee)).to.be.eq(traderBalanceAfter);
            expect(trader2BalanceBefore.add(vip1Fee)).to.be.eq(trader2BalanceAfter);
            expect(trader3BalanceBefore.add(vip2Fee)).to.be.eq(trader3BalanceAfter);
            expect(trader4BalanceBefore.add(vip3Fee)).to.be.eq(trader4BalanceAfter);
            expect(trader5BalanceBefore.add(vip4Fee)).to.be.eq(trader5BalanceAfter);
            expect(trader6BalanceBefore.add(vip5Fee)).to.be.eq(trader6BalanceAfter);

            // keeper claim trading fee
            await feeCollector.connect(keeper.signer).claimKeeperTradingFee();
            const keeperBalanceAfter = await usdt.balanceOf(keeper.address);

            expect(
                keeperBalanceBefore
                    .add(traderKeeperFee)
                    .add(trader2KeeperFee)
                    .add(trader3KeeperFee)
                    .add(trader4KeeperFee)
                    .add(trader5KeeperFee)
                    .add(trader6KeeperFee),
            ).to.be.eq(keeperBalanceAfter);

            // claim staking trading fee
            await feeCollector.updateStakingPoolAddress(poolAdmin.address);
            await feeCollector.connect(poolAdmin.signer).claimStakingTradingFee();
            const claimStakingBalanceAfter = await usdt.balanceOf(poolAdmin.address);

            expect(
                poolAdminBalanceBefore
                    .add(traderStakingFee)
                    .add(trader2StakingFee)
                    .add(trader3StakingFee)
                    .add(trader4StakingFee)
                    .add(trader5StakingFee)
                    .add(trader6StakingFee),
            ).to.be.eq(claimStakingBalanceAfter);

            // claim treasury fee
            await roleManager.addPoolAdmin(poolAdmin.address);
            await feeCollector.connect(poolAdmin.signer).claimTreasuryFee();
            const claimTreasuryBalanceAfter = await usdt.balanceOf(poolAdmin.address);

            expect(
                claimStakingBalanceAfter
                    .add(traderTreasuryFee)
                    .add(trader2TreasuryFee)
                    .add(trader3TreasuryFee)
                    .add(trader4TreasuryFee)
                    .add(trader5TreasuryFee)
                    .add(trader6TreasuryFee),
            ).to.be.eq(claimTreasuryBalanceAfter);
        });
    });
});
