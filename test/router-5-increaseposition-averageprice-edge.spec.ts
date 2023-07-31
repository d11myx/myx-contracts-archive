import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { getBlockTimestamp, waitForTx } from './helpers/tx';
import { TradeType } from './shared/constants';
import { ITradingRouter, MockPriceFeed } from '../types';
import { expect } from './shared/expect';
import { btcPairInfo, ethPairInfo } from './config/pairs';


describe('Router: calculate open position price', () => {
	const pairIndex = 0;
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
	after(async () => { });

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

    it('failed to open position, validate average open price', async() =>{
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
        console.log(`traderOpenAverage: `, traderOpenAverage)

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
        const uncompletedPositionPrice = uncompletedPosition.averagePrice
        console.log(`uncompletedPosition: `, uncompletedPosition)
        console.log(`uncompletedPositionPrice: `, uncompletedPositionPrice)
    });

    it('decrease position, validate average open price', async() =>{
        const {
			keeper,
			users: [trader],
			tradingRouter,
            executeRouter,
            tradingVault,
        } = testEnv

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
            vaultPriceFeed
		} = testEnv;

        // modify btc price
		const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
		const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
		const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);

        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('40000', 8)));
        await waitForTx(
            await fastPriceFeed.connect(keeper.signer).setPrices(
                [btc.address],
                [ethers.utils.parseUnits('40000', 30)],
                (await getBlockTimestamp()) + 100,
            ),
        );

        const collateral = ethers.utils.parseUnits('10000', 18)

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
