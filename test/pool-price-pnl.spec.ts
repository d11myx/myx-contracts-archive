import { ethers } from 'hardhat';
import { newTestEnv, TestEnv } from './helpers/make-suite';
import { before } from 'mocha';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { deployMockCallback, getBlockTimestamp, TradeType, waitForTx } from '../helpers';
import { TradingTypes } from '../types/contracts/interfaces/IRouter';
import { MockPriceFeed, PoolToken } from '../types';
import { expect } from './shared/expect';
import { getContract } from '../helpers/utilities/tx';

describe('Modify LP Average Price', async () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            btc,
            usdt,
            pool,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('20000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);

        let testCallBack = await deployMockCallback(btc.address, usdt.address);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        let pair = await pool.getPair(pairIndex);

        let lpToken = (await getContract<PoolToken>('Token', pair[3])) as PoolToken;
        let bal = await lpToken.balanceOf(depositor.address);
        expect(bal).to.be.eq('0');
        await testCallBack.connect(depositor.signer).addLiquidity(pool.address, pairIndex, indexAmount, stableAmount);
        bal = await lpToken.balanceOf(depositor.address);
        expect(bal).to.be.eq('891000000000000000000000000');
        let blaPool = await lpToken.balanceOf(pool.address);
        // expect(blaPool).to.be.eq('1');

    });

    after(async () => {});

    describe('Platform is long position', async () => {
        before('increase long position: +20 BTC, openPrice: 30000', async () => {
            const {
                users: [trader],
                usdt,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('20000', 18);
            const sizeAmount = ethers.utils.parseUnits('20', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, true);
        });

        after(async () => {
            await updateBTCPrice(testEnv, '30000');
        });

        it('BTO: increase long position: +10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                positionManager,
                orderManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('40000', 30);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: true,
                sizeAmount: sizeAmount,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.averagePrice).to.be.eq(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('BTO: increase long position: +10 BTC, openPrice: 29000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                positionManager,
                orderManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '29000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('100000', 18);
            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);

            const sizeAmount = ethers.utils.parseUnits('20', 18);
            const openPrice = ethers.utils.parseUnits('29000', 30);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: true,
                sizeAmount: sizeAmount,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            const uintNum = ethers.utils.parseUnits('1', 18);
            expect(positionAft.averagePrice.div(uintNum)).to.be.eq(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount))
                    .div(uintNum),
            );
        });

        it('STC: decrease long position: -10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                positionManager,
                orderManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('40000', 30);

            const decreasePositionRequst: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                isLong: true,
                triggerPrice: openPrice,
                sizeAmount: sizeAmount,
            };

            const orderId = await orderManager.decreaseMarketOrdersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequst);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolLosses = sizeAmount
                .mul(positionBef.averagePrice.sub(openPrice))
                .div(ethers.utils.parseUnits('1', 30))
                .abs();
            const userProfit = positionAft.realisedPnl;

            expect(poolLosses).to.be.eq(userProfit);
            expect(positionBef.averagePrice).to.be.lt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('STC: decrease long position: -10 BTC, openPrice: 29000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                positionManager,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '29000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', 18);
            const descreaseAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('29000', 30);

            const decreasePositionRequst: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                isLong: true,
                triggerPrice: openPrice,
                sizeAmount: descreaseAmount,
            };

            const orderId = await orderManager.decreaseMarketOrdersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequst);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolProfit = descreaseAmount
                .mul(positionBef.averagePrice.sub(openPrice))
                .div(ethers.utils.parseUnits('1', 30));
            const userLosses = positionAft.realisedPnl.sub(positionBef.realisedPnl).abs();

            expect(poolProfit).to.be.eq(userLosses);
            expect(positionBef.averagePrice).to.be.gt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(descreaseAmount))
                    .div(positionBefAmount.add(descreaseAmount)),
            );
        });
    });

    describe('Platform is short position', async () => {
        let btcPriceFeed: MockPriceFeed;

        before('increase short position: +10 BTC, openPrice: 30000', async () => {
            const {
                deployer,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('20000', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, false);
        });

        after(async () => {
            await updateBTCPrice(testEnv, '60000');
        });

        it('STO: increase short position: +10 BTC, openPrice: 20000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '20000');

            const collateral = ethers.utils.parseUnits('200000', 18);
            const shortAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('20000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);

            const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: false,
                sizeAmount: shortAmount,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.averagePrice).to.be.eq(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(shortAmount))
                    .div(position.positionAmount.add(shortAmount)),
            );
        });

        it('STO: increase short position: +10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const collateral = ethers.utils.parseUnits('200000', 18);
            const shortAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('40000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);

            const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: false,
                sizeAmount: shortAmount,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(incresePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.averagePrice).to.be.eq(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(shortAmount))
                    .div(position.positionAmount.add(shortAmount)),
            );
        });

        it('BTC: decrease short position: -20 BTC, openPrice: 45000, newAveragePrice > openPositionAveragePrice, userBalance -> lpBalance', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '45000');

            const collateral = ethers.utils.parseUnits('200000', 18);
            const decreaseAmount = ethers.utils.parseUnits('20', 18);
            const openPrice = ethers.utils.parseUnits('45000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                sizeAmount: decreaseAmount,
                isLong: false,
            };

            const orderId = await orderManager.decreaseMarketOrdersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);

            const poolProfit = decreaseAmount
                .mul(openPrice.sub(position.averagePrice))
                .div(ethers.utils.parseUnits('1', 30));
            const userLosses = positionAft.realisedPnl.abs();

            expect(positionAft.averagePrice).to.be.lt(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(decreaseAmount))
                    .div(position.positionAmount.add(decreaseAmount)),
            );
            expect(poolProfit).to.be.eq(userLosses);
        });

        it('BTC: decrease short position: -5  BTC, openPrice: 10000, newAveragePrice < openPositionAveragePrice, lpBalance -> userBalance', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '10000');

            const collateral = ethers.utils.parseUnits('200000', 18);
            const decreaseAmount = ethers.utils.parseUnits('5', 18);
            const openPrice = ethers.utils.parseUnits('10000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                sizeAmount: decreaseAmount,
                isLong: false,
            };

            const orderId = await orderManager.decreaseMarketOrdersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);

            const poolLosses = decreaseAmount
                .mul(openPrice.sub(position.averagePrice))
                .div(ethers.utils.parseUnits('1', 30))
                .abs();
            const userPnl = positionAft.realisedPnl.sub(position.realisedPnl);

            expect(poolLosses).to.be.eq(userPnl);
            expect(positionAft.averagePrice).to.be.gt(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(decreaseAmount))
                    .div(position.positionAmount.add(decreaseAmount)),
            );
        });
    });
});
