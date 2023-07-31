import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { waitForTx } from './helpers/tx';
import { TradeType } from './shared/constants';
import { ITradingRouter } from '../types';
import { expect } from './shared/expect';


describe('Router: openPrice test cases', () => {
	const pairIndex = 0;

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
		const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true)
		console.log('before user position: ', traderPosition)

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
		await tradingRouter.connect(trader.signer).createDecreaseOrder(decreasePositionRequest)
		await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET)

		const balance = await usdt.balanceOf(trader.address)
		console.log(`User balance: `, balance)
		const position = await tradingVault.getPosition(trader.address, pairIndex, true)
		console.log('closed user position: ', position)
	});
	after(async () => { });

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

		const collateral = ethers.utils.parseUnits('10000', 18)
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
        await expect(executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET)).to.be.revertedWith('not reach trigger price');
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

		const collateral = ethers.utils.parseUnits('10000', 18)

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

        const position = await tradingVault.getPosition(trader.address, pairIndex, true)
        console.log(`position: `, position)

        const longTracker = await tradingVault.longTracker(pairIndex);
        console.log(`longTracker: `, longTracker);
	});
});
