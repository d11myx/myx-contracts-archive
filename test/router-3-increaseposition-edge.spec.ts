import { SignerWithAddress, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { ITradingRouter } from '../types';
import { expect } from './shared/expect';
import { waitForTx } from '../helpers/utilities/tx';
import { TradeType } from '../helpers';

describe('Router: sizeAmount cases', () => {
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

        await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
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
