import { testEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { extraHash, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: increase position ar', () => {
    const pairIndex = 1;

    before(async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator],
            btc,
            usdt,
            pool,
            router,
            oraclePriceFeed,
            roleManager,
        } = testEnv;
        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
        await roleManager.connect(deployer.signer).addOperator(operator.address);
        await roleManager.connect(operator.signer).removeAccountBlackList(depositor.address);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [btc.address],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                { value: 1 },
            );
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
                btc,
                router,
                positionManager,
            } = testEnv;

            const amount = ethers.utils.parseUnits('30000', await usdt.decimals());
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

            // View user's position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log("user's position", traderPosition);

            const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('8', await btc.decimals()),
                tpPrice: ethers.utils.parseUnits('31000', 30),
                tp: ethers.utils.parseUnits('1', await btc.decimals()),
                slPrice: ethers.utils.parseUnits('29000', 30),
                sl: ethers.utils.parseUnits('1', await btc.decimals()),
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
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`position:`, position);

            expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('5', await btc.decimals()));
        });

        it('hava a position and collateral, input collateral > 0', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`user's current postion: `, traderPosition);

            const amount = ethers.utils.parseUnits('30000', await usdt.decimals());

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: amount,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`update position:`, position);

            expect(position.positionAmount).to.be.eq(
                traderPosition.positionAmount.add(ethers.utils.parseUnits('5', await btc.decimals())),
            );
        });

        it('hava a postion and collateral, input collateral = 0', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`before position: `, traderPosition);

            // const traderBalance = await usdt.balanceOf(trader.address)
            // console.log(`user balance: `, traderBalance)

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`after position :`, positionAfter);

            expect(positionAfter.positionAmount).to.be.eq(
                traderPosition.positionAmount.add(ethers.utils.parseUnits('5', await btc.decimals())),
            );
        });

        it('hava a postion and collateral, input collateral < 0', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const balanceBefore = await usdt.balanceOf(trader.address);
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const traderCollateral = traderPosition.collateral;

            // console.log(`user balanceBefore: `, balanceBefore);
            // console.log(`user traderCollateral: `, traderCollateral);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-50', await usdt.decimals()),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();

            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            const collateralAfter = position.collateral;

            // user address add collateral
            const balanceAfter = await usdt.balanceOf(trader.address);

            // console.log(`user balanceBefore: `, balanceBefore);
            // console.log(`user traderCollateral: `, traderCollateral);
            // console.log(`After collateral: `, collateralAfter);
            // console.log(`After balance: `, balanceAfter);

            // expect(traderCollateral).to.be.eq(collateralAfter.add(ethers.utils.parseUnits('500', 18)));
        });

        it('hava a postion and collateral, input: collateral < 0 and abs > collateral', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                orderManager,
                positionManager,
            } = testEnv;

            const balance = await usdt.balanceOf(trader.address);
            const traderPosition = positionManager.getPosition(trader.address, pairIndex, true);
            const traderCollateral = (await traderPosition).collateral;

            // console.log(`user balance: `, balance);
            // console.log('user collateral: ', traderCollateral);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-93000', await usdt.decimals()),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            await expect(router.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
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
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log('before user position: ', traderPosition);

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
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteDecreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const balance = await usdt.balanceOf(trader.address);
            // console.log(`User balance: `, balance);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log('closed user position: ', position);
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
        //     await expect(router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest)).to.be.reverted;
        //     // await tradingRouter.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest);
        //     // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
        // });

        it('reopen positon for testing', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;
            // open position
            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('20000', await usdt.decimals()),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`new open position: `, position);
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
        // 	// await tradingRouter.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest);
        // 	// await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        // 	// const position = await tradingVault.getPosition(trader.address, pairIndex, true)
        // 	// console.log(`new open position: `, position)
        // });

        it('hava a position, input sizeAmount > 0, normal open position', async () => {
            const {
                keeper,
                users: [trader],
                router,
                btc,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
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
                sizeAmount: ethers.utils.parseUnits('10', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`position: `, position);
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
                indexPriceFeed,
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log('before user position: ', traderPosition);

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
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteDecreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const balance = await usdt.balanceOf(trader.address);
            // console.log(`User balance: `, balance);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log('closed user position: ', position);
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
                btc,
                orderManager,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('29600', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 500000,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            const tx = await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );
            const reason = await extraHash(tx.hash, 'CancelOrder', 'reason');
            expect(reason).to.be.eq('exceeds max slippage');
        });

        it('open position, where openPrice >= marketPrice, normal open positon', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                btc,
                orderManager,
                positionManager,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('31000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`position: `, position);

            const longTracker = await positionManager.longTracker(pairIndex);
            // console.log(`longTracker: `, longTracker);
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
                indexPriceFeed,
                orderManager,
                positionManager,
                router,
                executor,
            } = testEnv;

            await updateBTCPrice(testEnv, '30000');

            // closing position
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log('before user position: ', traderPosition);

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
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteDecreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );
        });
        after(async () => {});

        it('first open price: calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                btc,
                usdt,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('10', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const firstPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const firstOpenPrice = firstPosition.averagePrice;
            // console.log(`firstPosition: `, firstPosition);
            // console.log(`firstOpenPrice: `, firstOpenPrice);
        });

        it('failed to open position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                btc,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const traderOpenAverage = traderPosition.averagePrice;
            // console.log(`traderPosition: `, traderPosition);
            // console.log(`traderOpenAverage: `, traderOpenAverage);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('50000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const uncompletedPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const uncompletedPositionPrice = uncompletedPosition.averagePrice;
            // console.log(`uncompletedPosition: `, uncompletedPosition);
            // console.log(`uncompletedPositionPrice: `, uncompletedPositionPrice);
        });

        it('decrease position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                orderManager,
                positionManager,
                router,
                btc,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteDecreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const lastTimePrice = traderPosition.averagePrice;
            // console.log(`before closing position: `, traderPosition);
            // console.log(`price before closing position: `, lastTimePrice);

            const closingPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const closingPositionPrice = closingPosition.averagePrice;
            // console.log(`afer closing position: `, closingPosition);
            // console.log(`price afer closing position: `, closingPositionPrice);
        });

        it('increase position, update btc price, calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                orderManager,
                positionManager,
                indexPriceFeed,
                oraclePriceFeed,
                router,
                executor,
            } = testEnv;

            // modify btc price
            await updateBTCPrice(testEnv, '40000');

            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('40000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', await btc.decimals()),
                maxSlippage: 0,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor
                .connect(keeper.signer)
                .setPricesAndExecuteIncreaseMarketOrders(
                    [btc.address],
                    [await indexPriceFeed.getPrice(btc.address)],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    [{ orderId: orderId, tier: 0, commissionRatio: 0 }],
                    { value: 1 },
                );

            const secondPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`secondPosition: `, secondPosition);
            const secondOpenPrice = secondPosition.averagePrice;
            // console.log(`secondOpenPrice: `, secondOpenPrice);
        });
    });
});
