import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { deployMockCallback, getBlockTimestamp, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: increase position ar', () => {
    const pairIndex = 0;

    before(async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator],
            btc,
            usdt,
            pool,
            roleManager,
        } = testEnv;
        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);
        let testCallBack = await deployMockCallback();
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        await roleManager.connect(deployer.signer).addOperator(operator.address);
        await roleManager.connect(operator.signer).removeAccountBlackList(depositor.address);
        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('Router: collateral test cases', () => {
        before(async () => {
            await updateBTCPrice(testEnv, '30000');
        });
        after(async () => {});

        it('no position, where collateral <= 0', async () => {
            const {
                deployer,
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const amount = ethers.utils.parseUnits('30000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

            // View user's position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log("user's position", traderPosition);

            const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('8', 18),
                tpPrice: ethers.utils.parseUnits('31000', 30),
                tp: ethers.utils.parseUnits('1', 18),
                slPrice: ethers.utils.parseUnits('29000', 30),
                sl: ethers.utils.parseUnits('1', 18),
                maxSlippage: 0,
            };

            await expect(router.connect(trader.signer).createTpSl(increasePositionRequest)).to.be.reverted;
        });

        it('no position, open position', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                positionManager,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`position:`, position);

            expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));
        });

        it('hava a position and collateral, input collateral > 0', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`user's current postion: `, traderPosition);

            const amount = ethers.utils.parseUnits('30000', 18);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: amount,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`update position:`, position);

            expect(position.positionAmount).to.be.eq(
                traderPosition.positionAmount.add(ethers.utils.parseUnits('5', 18)),
            );
        });

        it('hava a postion and collateral, input collateral = 0', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`before position: `, traderPosition);

            // const traderBalance = await usdt.balanceOf(trader.address)
            // console.log(`user balance: `, traderBalance)

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`after position :`, positionAfter);

            expect(positionAfter.positionAmount).to.be.eq(
                traderPosition.positionAmount.add(ethers.utils.parseUnits('5', 18)),
            );
        });

        it('hava a postion and collateral, input collateral < 0', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const balanceBefore = await usdt.balanceOf(trader.address);
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const traderCollateral = traderPosition.collateral;

            console.log(`user balanceBefore: `, balanceBefore);
            console.log(`user traderCollateral: `, traderCollateral);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-50', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();

            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const collateralAfter = position.collateral;

            // user address add collateral
            const balanceAfter = await usdt.balanceOf(trader.address);

            console.log(`user balanceBefore: `, balanceBefore);
            console.log(`user traderCollateral: `, traderCollateral);
            console.log(`After collateral: `, collateralAfter);
            console.log(`After balance: `, balanceAfter);

            // expect(traderCollateral).to.be.eq(collateralAfter.add(ethers.utils.parseUnits('500', 18)));
        });

        it('hava a postion and collateral, input: collateral < 0 and abs > collateral', async () => {
            const {
                users: [trader],
                usdt,
                router,
                orderManager,
                positionManager,
            } = testEnv;

            const balance = await usdt.balanceOf(trader.address);
            const traderPosition = positionManager.getPosition(trader.address, pairIndex, true);
            const traderCollateral = (await traderPosition).collateral;

            console.log(`user balance: `, balance);
            console.log('user collateral: ', traderCollateral);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-93000', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            await expect(router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest)).to.be
                .reverted;
        });
    });

    describe('Router: sizeAmount cases', () => {
        before(async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const balance = await usdt.balanceOf(trader.address);
            console.log(`User balance: `, balance);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('closed user position: ', position);
        });
        after(async () => {});

        //TODO size can be 0

        // it('no position, open position where sizeAmount = 0', async () => {
        //     const {
        //         deployer,
        //         keeper,
        //         users: [trader],
        //         usdt,
        //         router,
        //         tradingRouter,
        //         executeRouter,
        //         tradingVault,
        //     } = testEnv;
        //
        //     const collateral = ethers.utils.parseUnits('1000', 18);
        //     await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
        //
        //     const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
        //         account: trader.address,
        //         pairIndex: pairIndex,
        //         tradeType: TradeType.MARKET,
        //         collateral: collateral,
        //         openPrice: ethers.utils.parseUnits('30000', 30),
        //         isLong: true,
        //         sizeAmount: 0,
        //         tpPrice: 0,
        //         tp: 0,
        //         slPrice: 0,
        //         sl: 0,
        //     };
        //
        //     // const orderId = await tradingRouter.ordersIndex();
        //
        //     await expect(router.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
        //     // await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
        //     // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
        // });

        it('reopen positon for testing', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;
            // open position
            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('20000', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`new open position: `, position);
        });

        //TODO: fix

        // it('hava a position, input sizeAmount = 0, withdraw collateral', async() => {
        // 	const {
        // 		keeper,
        // 		users: [trader],
        // 		tradingRouter,
        // 		executeRouter,
        // 		tradingVault,
        // 	} = testEnv;

        // 	// hava a position, input sizeAmount = 0, withdraw collateral
        // 	const traderCollateral = await tradingVault.getPosition(trader.address, pairIndex, true)
        // 	console.log(`user collateral: `, traderCollateral)
        // 	const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        // 		account: trader.address,
        // 		pairIndex: pairIndex,
        // 		tradeType: TradeType.MARKET,
        // 		collateral: -10000,
        // 		openPrice: ethers.utils.parseUnits('30000', 30),
        // 		isLong: true,
        // 		sizeAmount: 0,
        // 		tpPrice: 0,
        // 		tp: 0,
        // 		slPrice: 0,
        // 		sl: 0
        // 	}

        // 	// const orderId = await tradingRouter.ordersIndex();
        // 	// await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
        // 	// await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        // 	// const position = await tradingVault.getPosition(trader.address, pairIndex, true)
        // 	// console.log(`new open position: `, position)
        // });

        it('hava a position, input sizeAmount > 0, normal open position', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                orderManager,
                positionManager,
            } = testEnv;

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('10', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`position: `, position);
        });
    });

    describe('Router: openPrice test cases', () => {
        before(async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                oraclePriceFeed,
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const balance = await usdt.balanceOf(trader.address);
            console.log(`User balance: `, balance);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('closed user position: ', position);
        });
        after(async () => {});

        it('open position, where openPrice < marketPrice (marketPrice -= priceSlipP)', async () => {
            /*
                Example:
                    marketPrice = 30000
                    normal open position price: openPrice > 29700 (30000 * 1%, priceSlipP = 1%)
                    is not open position price: openPrice < 29700 (30000 * 1%, priceSlipP = 1%)
            */

            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                orderManager,
                router,
                executor,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('29600', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 500000,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await expect(
                executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');
        });

        it('open position, where openPrice >= marketPrice, normal open positon', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('31000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`position: `, position);

            const longTracker = await positionManager.longTracker(pairIndex);
            console.log(`longTracker: `, longTracker);
        });
    });

    describe('Router: calculate open position price', () => {
        before(async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                oraclePriceFeed,
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);
        });
        after(async () => {});

        it('first open price: calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('10', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const firstPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const firstOpenPrice = firstPosition.averagePrice;
            console.log(`firstPosition: `, firstPosition);
            console.log(`firstOpenPrice: `, firstOpenPrice);
        });

        it('failed to open position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const traderOpenAverage = traderPosition.averagePrice;
            console.log(`traderPosition: `, traderPosition);
            console.log(`traderOpenAverage: `, traderOpenAverage);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('50000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const uncompletedPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const uncompletedPositionPrice = uncompletedPosition.averagePrice;
            console.log(`uncompletedPosition: `, uncompletedPosition);
            console.log(`uncompletedPositionPrice: `, uncompletedPositionPrice);
        });

        it('decrease position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const lastTimePrice = traderPosition.averagePrice;
            console.log(`before closing position: `, traderPosition);
            console.log(`price before closing position: `, lastTimePrice);

            const closingPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const closingPositionPrice = closingPosition.averagePrice;
            console.log(`afer closing position: `, closingPosition);
            console.log(`price afer closing position: `, closingPositionPrice);
        });

        it('increase position, update btc price, calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                orderManager,
                positionManager,
                indexPriceFeed,
                oraclePriceFeed,
                router,
                executor,
            } = testEnv;

            // modify btc price
            await updateBTCPrice(testEnv, '40000');

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('40000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

            const secondPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            console.log(`secondPosition: `, secondPosition);
            const secondOpenPrice = secondPosition.averagePrice;
            console.log(`secondOpenPrice: `, secondOpenPrice);
        });
    });
});
