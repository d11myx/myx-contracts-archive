import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { ITradingRouter, MockPriceFeed } from '../types';
import { expect } from './shared/expect';
import { getBlockTimestamp, waitForTx } from '../helpers/utilities/tx';
import { MAX_UINT_AMOUNT, TradeType } from '../helpers';

describe('Router: Liquidation cases', () => {
    const pairIndex = 0;
    let btcPriceFeed: MockPriceFeed;

    before(async () => {
        const { btc, vaultPriceFeed } = testEnv;

        const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
        const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
        btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
    });
    after(async () => {
        const { keeper, btc, fastPriceFeed } = testEnv;

        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
        await waitForTx(
            await fastPriceFeed
                .connect(keeper.signer)
                .setPrices([btc.address], [ethers.utils.parseUnits('30000', 30)], (await getBlockTimestamp()) + 100),
        );
    });

    it("user's position leverage exceeded 100x, liquidated", async () => {
        const {
            deployer,
            keeper,
            users: [trader],
            btc,
            usdt,
            tradingRouter,
            executeRouter,
            tradingVault,
            tradingUtils,
            vaultPriceFeed,
            fastPriceFeed,
        } = testEnv;

        const collateral = ethers.utils.parseUnits('1000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
        await usdt.connect(trader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

        const size = collateral.div(30000).mul(100).mul(90).div(100);

        const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: size,
            tpPrice: 0,
            tp: 0,
            slPrice: 0,
            sl: 0,
        };

        // await tradingRouter.setHandler(trader.address, true);
        const orderId = await tradingRouter.increaseMarketOrdersIndex();
        await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);

        const leverageBef = positionBef.positionAmount.div(positionBef.collateral.div(30000));
        expect(leverageBef).to.be.eq(98);
        expect(positionBef.positionAmount).to.be.eq('2999999999999999970');

        // price goes down, trader's position can be liquidated
        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('20000', 8)));
        await waitForTx(
            await fastPriceFeed
                .connect(keeper.signer)
                .setPrices([btc.address], [ethers.utils.parseUnits('20000', 30)], (await getBlockTimestamp()) + 100),
        );

        const leverageAft = positionBef.positionAmount.div(positionBef.collateral.div(30000 + 10000));
        expect(leverageAft).to.be.eq(131);

        // liquidation
        const traderPositionKey = tradingUtils.getPositionKey(trader.address, pairIndex, true);
        await executeRouter.connect(keeper.signer).liquidatePositions([traderPositionKey]);

        const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
        expect(positionAft.positionAmount).to.be.eq(0);
    });
});
