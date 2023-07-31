import { SignerWithAddress, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { ITradingRouter, MockPriceFeed } from '../types';
import { expect } from './shared/expect';
import { getBlockTimestamp, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';

describe('Router: increase position ar', () => {
    const pairIndex = 0;

    describe('Router: collateral test cases', () => {
        before(async () => {
            const { btc, vaultPriceFeed } = testEnv;

            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
        });
        after(async () => {});

        it('no position, where collateral <= 0', async () => {
            const {
                deployer,
                users: [trader],
                usdt,
                tradingRouter,
                tradingVault,
            } = testEnv;

            const amount = ethers.utils.parseUnits('30000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

            // View user's position
            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log("user's position", traderPosition);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
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
            };

            await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be
                .reverted;
        });

        it('no position, open position', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`position:`, position);

            expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));
        });

        it('hava a position and collateral, input collateral > 0', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`user's current postion: `, traderPosition);

            const amount = ethers.utils.parseUnits('300', 18);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: amount,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`before position: `, traderPosition);

            // const traderBalance = await usdt.balanceOf(trader.address)
            // console.log(`user balance: `, traderBalance)

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const balanceBefore = await usdt.balanceOf(trader.address);
            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const traderCollateral = traderPosition.collateral;

            console.log(`user balanceBefore: `, balanceBefore);
            console.log(`user traderCollateral: `, traderCollateral);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-500', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
            const collateralAfter = position.collateral;

            // user address add collateral
            const balanceAfter = await usdt.balanceOf(trader.address);

            console.log(`After collateral: `, collateralAfter);
            console.log(`After balance: `, balanceAfter);

            expect(traderCollateral).to.be.eq(collateralAfter.add(ethers.utils.parseUnits('500', 18)));
        });

        it('hava a postion and collateral, input: collateral < 0 and abs > collateral', async () => {
            const {
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const balance = await usdt.balanceOf(trader.address);
            const traderPosition = tradingVault.getPosition(trader.address, pairIndex, true);
            const traderCollateral = (await traderPosition).collateral;

            console.log(`user balance: `, balance);
            console.log('user collateral: ', traderCollateral);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('-9300', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be
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
                vaultPriceFeed,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));

            // closing position
            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
            };
            const orderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const balance = await usdt.balanceOf(trader.address);
            console.log(`User balance: `, balance);
            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log('closed user position: ', position);
        });
        after(async () => {});

        it('no position, open position where sizeAmount = 0', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('1000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: 0,
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            // const orderId = await tradingRouter.increaseMarketOrdersIndex();

            await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be
                .reverted;
            // await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
        });

        it('reopen positon for testing', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            // open position
            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: ethers.utils.parseUnits('20000', 18),
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };
            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
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

        // 	// const orderId = await tradingRouter.increaseMarketOrdersIndex();
        // 	// await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
        // 	// await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        // 	// const position = await tradingVault.getPosition(trader.address, pairIndex, true)
        // 	// console.log(`new open position: `, position)
        // });

        it('hava a position, input sizeAmount > 0, normal open position', async () => {
            const {
                keeper,
                users: [trader],
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('10', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                vaultPriceFeed,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));

            // closing position
            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
            };
            const orderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const balance = await usdt.balanceOf(trader.address);
            console.log(`User balance: `, balance);
            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
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
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('29600', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await expect(
                executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET),
            ).to.be.revertedWith('not reach trigger price');
        });

        it('open position, where openPrice >= marketPrice, normal open positon', async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                usdt,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('31000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const position = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`position: `, position);

            const longTracker = await tradingVault.longTracker(pairIndex);
            console.log(`longTracker: `, longTracker);
        });
    });

    describe('Router: calculate open position price', () => {
        let btcPriceFeed: MockPriceFeed;

        before(async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                vaultPriceFeed,
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));

            // closing position
            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log('before user position: ', traderPosition);

            const decreasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: traderPosition.positionAmount,
            };
            const orderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);
        });
        after(async () => {});

        it('first open price: calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('10', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const firstPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const firstOpenPrice = firstPosition.averagePrice;
            console.log(`firstPosition: `, firstPosition);
            console.log(`firstOpenPrice: `, firstOpenPrice);
        });

        it('failed to open position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const traderOpenAverage = traderPosition.averagePrice;
            console.log(`traderPosition: `, traderPosition);
            console.log(`traderOpenAverage: `, traderOpenAverage);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice: ethers.utils.parseUnits('50000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const uncompletedPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const uncompletedPositionPrice = uncompletedPosition.averagePrice;
            console.log(`uncompletedPosition: `, uncompletedPosition);
            console.log(`uncompletedPositionPrice: `, uncompletedPositionPrice);
        });

        it('decrease position, validate average open price', async () => {
            const {
                keeper,
                users: [trader],
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;

            const decreasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
            };
            const orderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const lastTimePrice = traderPosition.averagePrice;
            console.log(`before closing position: `, traderPosition);
            console.log(`price before closing position: `, lastTimePrice);

            const closingPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            const closingPositionPrice = closingPosition.averagePrice;
            console.log(`afer closing position: `, closingPosition);
            console.log(`price afer closing position: `, closingPositionPrice);
        });

        it('increase position, update btc price, calculate average open price', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                tradingRouter,
                executeRouter,
                tradingVault,
                fastPriceFeed,
                vaultPriceFeed,
            } = testEnv;

            // modify btc price
            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);

            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('40000', 8)));
            await waitForTx(
                await fastPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('40000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const collateral = ethers.utils.parseUnits('10000', 18);

            const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('40000', 30),
                isLong: true,
                sizeAmount: ethers.utils.parseUnits('5', 18),
                tpPrice: 0,
                tp: 0,
                slPrice: 0,
                sl: 0,
            };

            const orderId = await tradingRouter.increaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const secondPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(`secondPosition: `, secondPosition);
            const secondOpenPrice = secondPosition.averagePrice;
            console.log(`secondOpenPrice: `, secondOpenPrice);
        });
    });
});
