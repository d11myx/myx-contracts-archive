import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { deployMockCallback, getRouter, TradeType } from '../helpers';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradingTypes } from '../types/contracts/trading/Router';

describe('Trading: decrease position', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor,trader],
            usdt,
            btc,
            pool,
            router,
            positionManager
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('200', 18);
        const stableAmount = ethers.utils.parseUnits('300000', 18);
        let testCallBack = await deployMockCallback();
        var pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('no position, decrease position', () => {
        it('no position, where decreaseAmount = 0, decrease position, trigger error: zero position amount', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', 18);
            const decreaseAmount = ethers.utils.parseUnits('0', 18);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                sizeAmount: decreaseAmount,
                isLong: true
            };

            const orderId = await orderManager.ordersIndex();
            await expect(router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest)).to.be.revertedWith('zero position amount');
            // await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

        });


        it('no position, where decreaseAmount < 0, decrease position, trigger error: decrease amount exceed position', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', 18);
            const decreaseAmount = ethers.utils.parseUnits('1', 18).abs();

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                sizeAmount: decreaseAmount,
                isLong: true
            };

            const orderId = await orderManager.ordersIndex();
            await expect(router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest)).to.be.revertedWith('decrease amount exceed position');
            // await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

        });

    });

    describe('keeper permission check', () => {
        before('increase position', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager
            } = testEnv;

            // increase position
            const collateral = ethers.utils.parseUnits('20000', 18);
            const increaseAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, increaseAmount, TradeType.MARKET, true);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(position.positionAmount).to.be.eq(increaseAmount);
        });

        after('closing position', async () =>{
            const {
                users: [trader],
                positionManager
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, true);

            const collateral = ethers.utils.parseUnits('0', 18);
            await decreasePosition(testEnv, trader, pairIndex, collateral, position.positionAmount, TradeType.MARKET, true);
        });

        it('executed as an unauthorized user', async () => {
            const {
                users: [trader, customer],
                router,
                executor,
                orderManager,
                positionManager
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, true);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('0', 18),
                triggerPrice: position.averagePrice,
                sizeAmount: position.positionAmount,
                isLong: true
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await expect(executor.connect(customer.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0 )).to.be.revertedWith('onlyPositionKeeper');
        });
    });

    describe('check LP funds provide liquidity', () => {
        before('increase position', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager
            } = testEnv;

            // increase position
            const collateral = ethers.utils.parseUnits('20000', 18);
            const increaseAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, increaseAmount, TradeType.MARKET, true);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(position.positionAmount).to.be.eq(increaseAmount);
        });


        after('increase position', async ()=>{});

        it('check position', async () =>{
            const {
                users: [trader, shorter],
                positionManager,
                pool
            } = testEnv;

            const pairVaultInfo = await pool.getVault(pairIndex);

            console.log(
                'indexTotalAmount',
                pairVaultInfo.indexTotalAmount,
                'indexReservedAmount',
                pairVaultInfo.indexReservedAmount,
            );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`---position: `, position);
        });
    });

    // describe('long > short', () => {
    //     before('Before: increase long position', async () => {
    //         const {
    //             users: [trader],
    //             usdt,
    //             router,
    //             orderManager,
    //             positionManager
    //         } = testEnv;
    //
    //         const netExposureAmountChecker = await positionManager.netExposureAmountChecker(pairIndex);
    //         expect(netExposureAmountChecker).to.be.eq(0);
    //
    //         const collateral = ethers.utils.parseUnits('20000', 18);
    //         const increaseAmount = ethers.utils.parseUnits('10', 18);
    //         const openPrice = ethers.utils.parseUnits('30000', 30);
    //
    //         await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
    //         await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, increaseAmount, TradeType.MARKET, true);
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, true);
    //         const aftNetExposureAmountChecker = await positionManager.netExposureAmountChecker(pairIndex);
    //
    //         expect(aftNetExposureAmountChecker).to.be.gt(0);
    //         expect(position.positionAmount).to.be.eq(increaseAmount);
    //     });
    //
    //     after(async () => {});
    //
    //     it('long > short, decreaseAmount > posiontAmount, trigger error: decrease amount exceed position', async () => {
    //         const {
    //             keeper,
    //             users: [trader],
    //             router,
    //             executor,
    //             orderManager,
    //             positionManager,
    //         } = testEnv;
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, true);
    //
    //         const collateral = ethers.utils.parseUnits('0', 18);
    //         const decreaseAmount = position.positionAmount.add(ethers.utils.parseUnits('1', 18));
    //
    //         const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
    //             account: trader.address,
    //             pairIndex: pairIndex,
    //             tradeType: TradeType.MARKET,
    //             collateral: collateral,
    //             triggerPrice: ethers.utils.parseUnits('30000', 30),
    //             sizeAmount: decreaseAmount,
    //             isLong: true
    //         };
    //
    //         const orderId = await orderManager.ordersIndex();
    //         await expect(router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest)).to.be.revertedWith('decrease amount exceed position');
    //         // await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);
    //
    //     });
    //
    //
    //     it('long > short, update btcPrice = triggerPrice, triggerforced closing position', async () => {
    //         const {
    //             keeper,
    //             users: [trader],
    //             router,
    //             executor,
    //             orderManager,
    //             positionManager,
    //             pool
    //         } = testEnv;
    //
    //         const btcUint = ethers.utils.parseUnits('1', 30);
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, true);
    //         const positionAvgPrice = position.averagePrice.div(btcUint);
    //         const maintainMarginRate = ethers.utils.parseUnits('1', 30).div(btcUint);
    //
    //         const triggerPrice = positionAvgPrice.sub(positionAvgPrice.mul(maintainMarginRate).div(100)).abs();
    //         const collateral = ethers.utils.parseUnits('0', 18);
    //
    //         const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
    //             account: trader.address,
    //             pairIndex: pairIndex,
    //             tradeType: TradeType.MARKET,
    //             collateral: collateral,
    //             triggerPrice: ethers.utils.parseUnits('30000', 30),
    //             sizeAmount: position.positionAmount,
    //             isLong: true
    //         };
    //
    //         const orderId = await orderManager.ordersIndex();
    //         await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
    //
    //         // update BTC Price
    //         await updateBTCPrice(testEnv, triggerPrice.toString());
    //         await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);
    //
    //         const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
    //         // console.log(`---positionAft: `, positionAft);
    //
    //         expect(positionAft.positionAmount).to.be.eq(0);
    //     });
    //
    //
    //     it('long > short, decreaseAmount = posiontAmount, decrease long position', async () => {
    //         const {
    //             users: [trader],
    //             usdt,
    //             router,
    //             positionManager,
    //         } = testEnv;
    //
    //         const increaseCollateral = ethers.utils.parseUnits('20000', 18);
    //         const increaseAmount = ethers.utils.parseUnits('10', 18);
    //         const openPrice = ethers.utils.parseUnits('30000', 30);
    //
    //         await mintAndApprove(testEnv, usdt, increaseCollateral, trader, router.address);
    //         await increasePosition(testEnv, trader, pairIndex, increaseCollateral, openPrice, increaseAmount, TradeType.MARKET, true);
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, true);
    //
    //         const decreaseCollateral = ethers.utils.parseUnits('0', 18);
    //         await decreasePosition(testEnv, trader, pairIndex, decreaseCollateral, position.positionAmount, TradeType.MARKET, true);
    //
    //         const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
    //         expect(positionAft.positionAmount).to.be.eq(0);
    //
    //     });
    //
    // })

    // describe('long < short', () => {
    //     before('Before: increase short position', async () => {
    //         const {
    //             users: [trader],
    //             usdt,
    //             router,
    //             orderManager,
    //             positionManager
    //         } = testEnv;
    //
    //         await updateBTCPrice(testEnv, '30000');
    //
    //         const netExposureAmountChecker = await positionManager.netExposureAmountChecker(pairIndex);
    //         expect(netExposureAmountChecker).to.be.eq(0);
    //
    //         const collateral = ethers.utils.parseUnits('20000', 18);
    //         const increaseAmount = ethers.utils.parseUnits('10', 18);
    //         const openPrice = ethers.utils.parseUnits('30000', 30);
    //
    //         await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
    //         await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, increaseAmount, TradeType.MARKET, false);
    //
    //         const aftNetExposureAmountChecker = await positionManager.netExposureAmountChecker(pairIndex);
    //         expect(aftNetExposureAmountChecker).to.be.lt(0);
    //     });
    //
    //     after(async () => {});
    //
    //     it('long < short, decreaseAmount > posiontAmount, trigger error: decrease amount exceed position', async () => {
    //         const {
    //             keeper,
    //             users: [trader],
    //             router,
    //             executor,
    //             orderManager,
    //             positionManager,
    //         } = testEnv;
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, false);
    //         console.log(`---position: `, position);
    //
    //         const collateral = ethers.utils.parseUnits('0', 18);
    //         const decreaseAmount = position.positionAmount.add(ethers.utils.parseUnits('1', 18));
    //
    //         const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
    //             account: trader.address,
    //             pairIndex: pairIndex,
    //             tradeType: TradeType.MARKET,
    //             collateral: collateral,
    //             triggerPrice: ethers.utils.parseUnits('30000', 30),
    //             sizeAmount: decreaseAmount,
    //             isLong: false
    //         };
    //
    //         const orderId = await orderManager.ordersIndex();
    //         await expect(router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest)).to.be.revertedWith('decrease amount exceed position');
    //         // await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);
    //
    //     });
    //
    //     it('long < short, decreaseAmount = posiontAmount, decrease all position', async () => {
    //         const {
    //             users: [trader],
    //             usdt,
    //             router,
    //             positionManager,
    //         } = testEnv;
    //
    //         const position = await positionManager.getPosition(trader.address, pairIndex, false);
    //
    //         const collateral = ethers.utils.parseUnits('0', 18);
    //         await decreasePosition(testEnv, trader, pairIndex, collateral, position.positionAmount, TradeType.MARKET, false);
    //
    //         const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
    //         expect(positionAft.positionAmount).to.be.eq(0);
    //
    //     });
    //
    // })

});
