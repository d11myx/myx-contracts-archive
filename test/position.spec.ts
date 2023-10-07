import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { mintAndApprove, updateBTCPrice, increasePosition } from './helpers/misc';
import { TradeType, getMockToken } from '../helpers';
import { TradingTypes } from '../types/contracts/interfaces/IRouter';
import { loadReserveConfig } from '../helpers/market-config-helper';
import { MARKET_NAME } from '../helpers/env';
import { constants, BigNumber } from 'ethers';

describe('Position', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    describe('Position: liquidate positions', () => {
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
                const indexAmount = ethers.utils.parseUnits('10000', 18);
                const stableAmount = ethers.utils.parseUnits('300000000', 18);
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('exist entrust position, one-way short liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', 18);
                const size = ethers.utils.parseUnits('30', 18);
                const openPrice = ethers.utils.parseUnits('300000', 30);

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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increseEntrustPositionRequest);
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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
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

                // update price and liquidatePositions
                await updateBTCPrice(testEnv, '36000');
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                executionLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

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

                expect(balance).to.be.eq(
                    shortPositionBefore.collateral.sub(totalSettlementAmount).add(entrustOrderBefore.collateral),
                );
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
                const indexAmount = ethers.utils.parseUnits('10000', 18);
                const stableAmount = ethers.utils.parseUnits('300000000', 18);
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('not exist entrust position, one-way short liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
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
                executionLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

                balance = await usdt.balanceOf(trader.address);
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

                expect(balance).to.be.eq(shortPositionBefore.collateral.sub(totalSettlementAmount));
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
                const indexAmount = ethers.utils.parseUnits('10000', 18);
                const stableAmount = ethers.utils.parseUnits('300000000', 18);
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('two-way long liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increseShortPositionRequest);
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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increseLongPositionRequest);
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

                // update price and liquidatePositions
                await updateBTCPrice(testEnv, '20000');
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
                executionLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const longPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

                // calculate totalSettlementAmount
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const pnl = longPositionBefore.positionAmount
                    .mul(oraclePrice.sub(longPositionBefore.averagePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = longPositionBefore.positionAmount
                    .mul(oraclePrice)
                    .div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');
                const totalSettlementAmount = pnl.abs().add(tradingFee);

                expect(balance).to.be.lt(longPositionBefore.collateral.sub(totalSettlementAmount).abs());
                expect(shortPositionAfter.positionAmount).to.be.eq(size);
                expect(longPositionAfter.positionAmount).to.be.eq('0');
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
                const indexAmount = ethers.utils.parseUnits('10000', 18);
                const stableAmount = ethers.utils.parseUnits('300000000', 18);
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('risk rate = 100.5%, liquidate position', async () => {
                const {
                    users: [trader],
                    usdt,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', 18);
                const size = ethers.utils.parseUnits('30', 18);
                const openPrice = ethers.utils.parseUnits('300000', 30);

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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increseEntrustPositionRequest);
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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
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

                // update price and liquidatePositions
                await updateBTCPrice(testEnv, '35700');
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                executionLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const pnl = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice.sub(oraclePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = shortPositionBefore.positionAmount
                    .mul(oraclePrice)
                    .div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');
                const totalSettlementAmount = pnl.abs().add(tradingFee);

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const riskRate = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000')
                    .mul('100000000')
                    .div(exposureAsset);

                expect(riskRate.div('1000000')).to.be.eq('105');
                expect(balance).to.be.eq(
                    shortPositionBefore.collateral.sub(totalSettlementAmount).add(entrustOrderBefore.collateral),
                );
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
                const indexAmount = ethers.utils.parseUnits('10000', 18);
                const stableAmount = ethers.utils.parseUnits('300000000', 18);
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            });

            it('risk rate = 200%, margin call liquidation', async () => {
                const {
                    users: [trader],
                    usdt,
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('300000', 18);
                const size = ethers.utils.parseUnits('30', 18);
                const openPrice = ethers.utils.parseUnits('300000', 30);

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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increseEntrustPositionRequest);
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
                await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
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

                // update price and liquidatePositions
                await updateBTCPrice(testEnv, '37710');
                const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
                executionLogic
                    .connect(keeper.signer)
                    .liquidatePositions([{ positionKey, sizeAmount: 0, level: 0, commissionRatio: 0 }]);

                balance = await usdt.balanceOf(trader.address);
                const shortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
                const entrustOrderAfter = await orderManager.getIncreaseOrder(entrustOrderId, TradeType.MARKET);

                // calculate totalSettlementAmount
                const pair = await pool.getPair(pairIndex);
                const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const oraclePrice = await pool.getPrice(pair.indexToken);
                const pnl = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice.sub(oraclePrice))
                    .div('1000000000000000000000000000000');
                const sizeDelta = shortPositionBefore.positionAmount
                    .mul(oraclePrice)
                    .div('1000000000000000000000000000000');
                const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFeeP).div('100000000');
                const totalSettlementAmount = pnl.abs().add(tradingFee);

                // calculate riskRate
                const exposureAsset = shortPositionBefore.collateral.add(pnl).sub(tradingFee);
                const riskRate = shortPositionBefore.positionAmount
                    .mul(shortPositionBefore.averagePrice)
                    .div('1000000000000000000000000000000')
                    .mul(tradingConfig.maintainMarginRate)
                    .div('100000000')
                    .mul('100000000')
                    .div(exposureAsset);

                expect(riskRate.div('1000000')).to.be.eq('200');
                expect(balance).to.be.eq(
                    shortPositionBefore.collateral.sub(totalSettlementAmount).add(entrustOrderBefore.collateral),
                );
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
                const indexAmount = ethers.utils.parseUnits('34', 18);
                const stableAmount = ethers.utils.parseUnits('1000000', 18);
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
                    router,
                    positionManager,
                    orderManager,
                    executionLogic,
                    keeper,
                    pool,
                } = testEnv;
                const collateral = ethers.utils.parseUnits('30000', 18);
                const collateral2 = ethers.utils.parseUnits('27000', 18);
                const size = ethers.utils.parseUnits('30', 18);
                const openPrice = ethers.utils.parseUnits('30000', 30);
                const size2 = ethers.utils.parseUnits('18.66', 18);

                /**
                 * open position trader take all indexToken
                 */
                await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
                let longTraderBalance = await usdt.balanceOf(longTrader.address);
                expect(longTraderBalance).to.be.eq(collateral);

                await increasePosition(
                    testEnv,
                    longTrader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size2,
                    TradeType.MARKET,
                    true,
                );
                longTraderBalance = await usdt.balanceOf(longTrader.address);
                expect(longTraderBalance).to.be.eq('0');

                await mintAndApprove(testEnv, usdt, collateral2, shortTrader, router.address);
                let shortTraderBalance = await usdt.balanceOf(shortTrader.address);
                expect(shortTraderBalance).to.be.eq(collateral2);

                await increasePosition(
                    testEnv,
                    shortTrader,
                    pairIndex,
                    collateral2,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );
                shortTraderBalance = await usdt.balanceOf(shortTrader.address);
                expect(shortTraderBalance).to.be.eq('0');

                await increasePosition(
                    testEnv,
                    longTrader,
                    pairIndex,
                    BigNumber.from(0),
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );

                /**
                 * short decrease position will wait for adl
                 */
                const shortTraderPositionBefore = await positionManager.getPosition(
                    shortTrader.address,
                    pairIndex,
                    false,
                );
                const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                    account: shortTrader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: 0,
                    triggerPrice: openPrice,
                    isLong: false,
                    sizeAmount: shortTraderPositionBefore.positionAmount,
                    maxSlippage: 0,
                };
                const decreaseOrderId = await orderManager.ordersIndex();
                await router.connect(shortTrader.signer).createDecreaseOrder(decreasePositionRequest);
                await executionLogic
                    .connect(keeper.signer)
                    .executeDecreaseOrder(decreaseOrderId, TradeType.MARKET, 0, 0, false, 0, true);
                const decreaseOrderInfo = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

                expect(decreaseOrderInfo.needADL).to.be.eq(true);

                // execute ADL
                const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
                await executionLogic.connect(keeper.signer).executeADLAndDecreaseOrder(
                    [
                        {
                            positionKey,
                            sizeAmount: shortTraderPositionBefore.positionAmount,
                            level: 0,
                            commissionRatio: 0,
                        },
                    ],
                    decreaseOrderId,
                    TradeType.MARKET,
                    0,
                    0,
                );
            });
        });
    });
});
