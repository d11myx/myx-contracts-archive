import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradeType, getMockToken, loadReserveConfig, MARKET_NAME } from '../helpers';
import { constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';
import { convertIndexAmountToStable } from '../helpers/token-decimals';

describe('Position', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('Position: liquidate positions', () => {
        describe('exist entrust position, one-way long liquidate position', () => {
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

            it('should cancel entrust position, long liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase long entrust position
                 */
                let longPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
                expect(longPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: true,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                longPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(longPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase long position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: true,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                longPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(longPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '29000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    longPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(longPositionBefore.averagePrice.sub(oraclePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = longPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = longPositionBefore.positionAmount
                    .mul(longPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate >= 100%
                expect(riskRate).to.be.gte('100000000');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const longPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(longPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(longPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });

        describe('exist entrust position, one-way short liquidate position', () => {
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

            it('should cancel entrust position, long liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '31000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate >= 100%
                expect(riskRate).to.be.gte('100000000');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });

        describe('not exist entrust position, normal liquidate position', () => {
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

            it('should normal liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                const shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '31000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate >= 100%
                expect(riskRate).to.be.gte('100000000');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(0);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
            });
        });

        describe('two-way long liquidate position', () => {
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

            it('should long liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseShortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const shortOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseShortPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
                const shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                /**
                 * increase long position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseLongPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: true,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseLongPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                const longPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(longPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '29000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    longPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(longPositionBefore.averagePrice.sub(oraclePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = longPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = longPositionBefore.positionAmount
                    .mul(longPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate >= 100%
                expect(riskRate).to.be.gte('100000000');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const longPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(0);
                expect(reserveBalance).to.be.eq(longPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq(size);
                expect(longPositionAfter.positionAmount).to.be.eq('0');
            });
        });

        describe('two-way short liquidate position', () => {
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

            it('should short liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseShortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const shortOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseShortPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
                const shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                /**
                 * increase long position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseLongPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: true,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseLongPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                const longPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(longPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '31000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.makerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate >= 100%
                expect(riskRate).to.be.gte('100000000');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const longPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(0);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(longPositionAfter.positionAmount).to.be.eq(size);
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
            });
        });

        describe('risk rate = 99%, no liquidate position', () => {
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

            it('should no liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '35450');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 99%, no execute liquidatePositions
                expect(riskRate.div('100000000')).to.be.eq('99');

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(shortPositionAfter.collateral.sub(totalSettlementAmount.abs())).to.be.eq(
                    shortPositionBefore.collateral.sub(totalSettlementAmount.abs()),
                );
                expect(balance).to.be.eq('0');
                expect(reserveBalance).to.be.eq('0');
                expect(shortPositionAfter.positionAmount).to.be.eq(size);
                expect(entrustOrderAfter.sizeAmount).to.be.eq(size);
            });
        });

        describe('risk rate = 100%, liquidate position', () => {
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

            it('should liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '35480');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 100%
                expect(riskRate.div('100000000')).to.be.eq('100');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });

        describe('risk rate = 100.5%, liquidate position', () => {
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

            it('should liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '35700');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 105%
                expect(riskRate.div('100000000')).to.be.eq('105');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });

        describe('risk rate = 200%, margin call liquidation', () => {
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

            it('should margin call liquidation', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '37710');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(oraclePrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 200%
                expect(riskRate.div('100000000')).to.be.eq('200');

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const totalSettlementAmount = pnl.sub(tradingFee);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });

        describe('liquidate position trigger ADL', () => {
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
                const indexAmount = ethers.utils.parseUnits('34', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('short decrease position will wait for adl', async () => {
                const {
                    users: [longTrader, shortTrader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                    liquidationLogic,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * increse long position
                 */
                await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
                let longTraderBalance = await usdt.balanceOf(longTrader.address);
                expect(longTraderBalance).to.be.eq(collateral);

                const increseLongPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: longTrader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: true,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const longOrderId = await orderManager.ordersIndex();
                await router.connect(longTrader.signer).createIncreaseOrder(increseLongPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(longOrderId, TradeType.MARKET, 0, 0);
                let longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);
                longTraderBalance = await usdt.balanceOf(longTrader.address);

                expect(longTraderBalance).to.be.eq('0');
                expect(longPosition.positionAmount).to.be.eq(size);

                /**
                 * increse short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
                let shortTraderBalance = await usdt.balanceOf(shortTrader.address);
                expect(shortTraderBalance).to.be.eq(collateral);

                const increseShortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: shortTrader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const shortOrderId = await orderManager.ordersIndex();
                await router.connect(shortTrader.signer).createIncreaseOrder(increseShortPositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(shortOrderId, TradeType.MARKET, 0, 0);
                let shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);
                shortTraderBalance = await usdt.balanceOf(shortTrader.address);

                expect(shortTraderBalance).to.be.eq('0');
                expect(shortPosition.positionAmount).to.be.eq(size);

                // update price
                await updateBTCPrice(testEnv, '29000');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(longPosition.averagePrice.sub(oraclePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = longPosition.collateral.add(pnl).sub(tradingFee);
                const margin = longPosition.positionAmount
                    .mul(longPosition.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate <=0
                expect(riskRate).to.be.lte('0');

                // remove liquidity
                const lpAmount = ethers.utils.parseEther('300000');
                const { receiveStableTokenAmount } = await pool.getReceivedAmount(pairIndex, lpAmount);
                const lpToken = await getMockToken('', pair.pairToken);
                await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
                await router
                    .connect(longTrader.signer)
                    .removeLiquidity(pair.indexToken, pair.stableToken, lpAmount, false);
                longTraderBalance = await usdt.balanceOf(longTrader.address);

                expect(longTraderBalance).to.be.eq(receiveStableTokenAmount);

                // execute liquidate positions
                const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                longTraderBalance = await usdt.balanceOf(longTrader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const longPositionAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);

                expect(reserveBalance).to.be.eq('0');
                expect(longPositionAfter.positionAmount).to.be.eq(size);

                // trigger adl
                const longOrders = await orderManager.getPositionOrders(positionKey);
                let adlOrder = await orderManager.getDecreaseOrder(longOrders[0].orderId, TradeType.MARKET);

                expect(adlOrder.needADL).to.be.eq(true);

                // execute adl
                await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                    [
                        {
                            positionKey,
                            sizeAmount: longPositionAfter.positionAmount,
                            level: 0,
                            commissionRatio: 0,
                        },
                    ],
                    adlOrder.orderId,
                    TradeType.MARKET,
                    0,
                    0,
                );
                adlOrder = await orderManager.getDecreaseOrder(longOrders[0].orderId, TradeType.MARKET);
                longTraderBalance = await usdt.balanceOf(longTrader.address);
                const longDecreasePositionAfter = await positionManager.getPosition(
                    longTrader.address,
                    pairIndex,
                    true,
                );

                expect(longTraderBalance).to.be.eq(receiveStableTokenAmount);
                expect(longDecreasePositionAfter.positionAmount).to.be.eq(
                    adlOrder.sizeAmount.sub(adlOrder.executedSize),
                );
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

            it('should cancel liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    oraclePriceFeed,
                    indexPriceFeed,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '35480');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const poolPrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(poolPrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(poolPrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 100%
                expect(riskRate.div('100000000')).to.be.eq('100');

                // update oracle price
                const latestOraclePrice = ethers.utils.parseUnits('35659', 8);
                const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
                const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
                const fee = mockPyth.getUpdateFee(updateData);
                await oraclePriceFeed
                    .connect(keeper.signer)
                    .updatePrice([btc.address], [latestOraclePrice], { value: fee });
                const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
                const indexPrice = await indexPriceFeed.getPrice(btc.address);

                // oraclePrice > indexPrice 0.5%
                expect(oraclePrice.sub(indexPrice).mul('100000000').div(oraclePrice)).to.be.gte(
                    tradingConfig.maxPriceDeviationP,
                );

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await expect(
                    liquidationLogic
                        .connect(keeper.signer)
                        .liquidatePositions([
                            { positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 },
                        ]),
                ).to.be.revertedWith('exceed max price deviation');
            });
        });

        describe('oracle price < keeper price 0.5%, liquidate position', () => {
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

            it('should liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    liquidationLogic,
                    keeper,
                    pool,
                    oraclePriceFeed,
                    indexPriceFeed,
                    riskReserve,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('30', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);

                /**
                 * trader increase short entrust position
                 */
                let shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                let balance = await usdt.balanceOf(trader.address);
                expect(balance).to.be.eq(collateral);

                const increseEntrustPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                    account: trader.address,
                    pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice,
                    isLong: false,
                    sizeAmount: size,
                    maxSlippage: 0,
                };

                const entrustOrderId = await orderManager.ordersIndex();
                await router.connect(trader.signer).createIncreaseOrder(increseEntrustPositionRequest);
                const entrustOrderBefore = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(entrustOrderBefore.sizeAmount).to.be.eq(size);
                expect(shortPositionBefore.positionAmount).to.be.eq('0');
                expect(balance).to.be.eq('0');

                /**
                 * increase short position
                 */
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                balance = await usdt.balanceOf(trader.address);
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
                await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
                await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
                shortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
                balance = await usdt.balanceOf(trader.address);

                expect(balance).to.be.eq('0');
                expect(shortPositionBefore.positionAmount).to.be.eq(size);

                // update maintainMarginRate
                const btcPair = loadReserveConfig(MARKET_NAME).PairsConfig['BTC'];
                const tradingConfigBefore = btcPair.tradingConfig;
                tradingConfigBefore.maintainMarginRate = 15000000;
                await pool.updateTradingConfig(pairIndex, tradingConfigBefore);
                const tradingConfigAfter = await pool.getTradingConfig(pairIndex);

                expect(tradingConfigAfter.maintainMarginRate).to.be.eq(tradingConfigBefore.maintainMarginRate);

                // update price
                await updateBTCPrice(testEnv, '35480');

                // calculate pnl、tradingFee
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const poolPrice = await pool.getPrice(pair.indexToken);
                const indexToStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    shortPositionBefore.positionAmount,
                );
                const pnl = indexToStableAmount
                    .mul(-1)
                    .mul(poolPrice.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = indexToStableAmount.mul(poolPrice).div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const margin = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000');
                const riskRate = margin.mul('100000000').div(exposureAsset);

                // riskRate = 100%
                expect(riskRate.div('100000000')).to.be.eq('100');

                // update oracle price
                const latestOraclePrice = ethers.utils.parseUnits('35621', 8);
                const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
                const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
                const fee = mockPyth.getUpdateFee(updateData);
                await oraclePriceFeed
                    .connect(keeper.signer)
                    .updatePrice([btc.address], [latestOraclePrice], { value: fee });
                const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
                const indexPrice = await indexPriceFeed.getPrice(btc.address);

                // oraclePrice < indexPrice 0.5%
                expect(indexPrice.sub(oraclePrice).mul('100000000').div(oraclePrice)).to.be.lt(
                    tradingConfig.maxPriceDeviationP,
                );

                // execute liquidatePositions
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                await liquidationLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey: positionKey, level: 0, commissionRatio: 0, sizeAmount: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const reserveBalance = await riskReserve.getReservedAmount(usdt.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const poolPriceAfter = await pool.getPrice(pair.indexToken);
                const pnlAfter = indexToStableAmount
                    .mul(-1)
                    .mul(poolPriceAfter.sub(shortPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDeltaAfter = indexToStableAmount.mul(poolPriceAfter).div('1000000000000000000000000000000');
                const tradingFeeAfter = sizeDeltaAfter.mul(tradingFeeConfig.takerFeeP).div('100000000');
                const totalSettlementAmount = pnlAfter.sub(tradingFeeAfter);

                expect(balance).to.be.eq(entrustOrderBefore.collateral);
                expect(reserveBalance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount.abs()));
                expect(shortPositionAfter.positionAmount).to.be.eq('0');
                expect(entrustOrderAfter.sizeAmount).to.be.eq('0');
            });
        });
    });
});
