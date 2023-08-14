import { ethers } from 'hardhat';
import { newTestEnv, TestEnv } from './helpers/make-suite';
import { before } from 'mocha';
import { increasePosition, mintAndApprove } from './helpers/misc';
import { deployMockCallback, getBlockTimestamp, TradeType, waitForTx } from '../helpers';
import { IRouter, TradingTypes } from '../types/contracts/interfaces/IRouter';
import { MockPriceFeed, Router__factory } from '../types';
import { expect } from './shared/expect';
import usdt from '../markets/usdt';

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
        console.log("usdt:"+usdt.address);

        let testCallBack = await deployMockCallback(btc.address, usdt.address);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        await testCallBack.connect(depositor.signer).addLiquidity(pool.address, pairIndex, indexAmount, stableAmount);
    });

    after(async () => {});

    describe('Platform is long position', async () => {
        let btcPriceFeed: MockPriceFeed;

        before(async () => {
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
            const sizeAmount = ethers.utils.parseUnits('20', 18);

            await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, true);
        });

        after(async () => {
            const { keeper, btc, indexPriceFeed, oraclePriceFeed } = testEnv;
            // update btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)),
            );
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
            await waitForTx(
                await indexPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('30000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );
        });

        it('BTO: increase long position, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                tradingVault,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('40000', 8)),
            );
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('40000', 8)));
            await waitForTx(
                await indexPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('40000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.averagePrice).to.be.eq(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('BTO: increase long position, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                tradingVault,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('29000', 8)),
            );
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('29000', 8)));
            await waitForTx(
                await indexPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('29000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            const uintNum = ethers.utils.parseUnits('1', 18);
            expect(positionAft.averagePrice.div(uintNum)).to.be.eq(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount))
                    .div(uintNum),
            );
        });

        it('STC: decrease long position, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                tradingVault,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('40000', 8)),
            );
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('40000', 8)));
            await waitForTx(
                await indexPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('40000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
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

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionBef.averagePrice).to.be.lt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('STC: decrease long position, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                tradingVault,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('29000', 8)),
            );
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('29000', 8)));
            await waitForTx(
                await indexPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('29000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('29000', 30);

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

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`---positionAft: `, positionAft);
            expect(positionBef.averagePrice).to.be.gt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });
    });

    // TODO: To be implemented
    // describe('Platform is short position', async () => {
    //     let btcPriceFeed: MockPriceFeed;
    //
    //     before(async () => {
    //         const {
    //             deployer,
    //             users: [ trader],
    //             usdt,
    //             btc,
    //             router,
    //             executor,
    //             orderManager
    //         } = testEnv;
    //
    //         const collateral = ethers.utils.parseUnits('20000', 18);
    //         const sizeAmount = ethers.utils.parseUnits('10', 18);
    //
    //         await mintAndApprove(testEnv, usdt, collateral, trader, orderManager.address);
    //         await increasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, false);
    //     });
    //
    //     after(async ()=>{
    //         const {
    //             keeper,
    //             btc,
    //             indexPriceFeed,
    //             oraclePriceFeed
    //         } = testEnv;
    //         // update btc price
    //         const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
    //         const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
    //         btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
    //         await waitForTx(
    //             await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)),
    //         );
    //         await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
    //         await waitForTx(
    //             await indexPriceFeed
    //                 .connect(keeper.signer)
    //                 .setPrices(
    //                     [btc.address],
    //                     [ethers.utils.parseUnits('30000', 30)],
    //                     (await getBlockTimestamp()) + 100,
    //                 ),
    //         );
    //     });
    //
    //
    //     it('STO: increase short postion, newAveragePrice < openPositionAveragePrice', async () =>{
    //
    //     });
    //
    //     it('STO: increase short postion, newAveragePrice > openPositionAveragePrice', async () =>{
    //
    //     });
    //
    //     it('BTC: decrease short positon, newAveragePrice > openPositionAveragePrice', async () =>{
    //
    //     });
    //
    //     it('BTC: decrease short position, newAveragePrice < openPositionAveragePrice', async () =>{
    //
    //     });
    //
    // });
});
