import { newTestEnv, SignerWithAddress, TestEnv, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { ITradingRouter, MockPriceFeed } from '../types';
import { BigNumber } from 'ethers';
import { getBlockTimestamp, waitForTx } from '../helpers/utilities/tx';
import { MAX_UINT_AMOUNT, POSITION_MANAGER_ID, TradeType } from '../helpers';
import { expect } from './shared/expect';
import { mintAndApprove } from './helpers/misc';
import { TradingTypes } from '../types/contracts/trading/Router';

describe('Router: Edge cases', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const { btc, vaultPriceFeed } = testEnv;

        const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
        const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
        const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
    });

    it('add liquidity', async () => {
        const {
            deployer,
            btc,
            usdt,
            users: [depositor],
            pairLiquidity,
            pairVault,
        } = testEnv;

        const btcAmount = ethers.utils.parseUnits('34', await btc.decimals());
        const usdtAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
        await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
        await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));

        await btc.connect(depositor.signer).approve(pairLiquidity.address, MAX_UINT_AMOUNT);
        await usdt.connect(depositor.signer).approve(pairLiquidity.address, MAX_UINT_AMOUNT);
        await pairLiquidity.connect(depositor.signer).addLiquidity(pairIndex, btcAmount, usdtAmount);

        const pairVaultInfo = await pairVault.getVault(pairIndex);
        console.log(
            `indexTotalAmount:`,
            ethers.utils.formatUnits(pairVaultInfo.indexTotalAmount, await btc.decimals()),
        );
        console.log(
            `stableTotalAmount:`,
            ethers.utils.formatUnits(pairVaultInfo.stableTotalAmount, await usdt.decimals()),
        );
    });

    it('open position with adding collateral', async () => {
        const {
            deployer,
            keeper,
            users: [trader],
            usdt,
            router,
            tradingRouter,
            executor,
            tradingVault,
            positionManager,
        } = testEnv;

        const amount = ethers.utils.parseUnits('30000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

        await usdt.connect(trader.signer).approve(positionManager.address, MAX_UINT_AMOUNT);

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: amount,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('10', 18),
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', 18),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', 18),
        };
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        const orderId = 0;
        console.log(`order:`, await router.increaseMarketOrders(orderId));

        await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        const position = await tradingVault.getPosition(trader.address, pairIndex, true);
        console.log(`position:`, position);
        expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));
    });

    it('increase position without adding collateral', async () => {
        const {
            keeper,
            users: [trader],
            tradingRouter,
            executeRouter,
            tradingVault,
        } = testEnv;

        const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;
        expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('10', 18));

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('8', 18),
            tpPrice: 0,
            tp: 0,
            slPrice: 0,
            sl: 0,
        };
        const orderId = await tradingRouter.increaseMarketOrdersIndex();
        await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

        const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
        const positionAmountAfter = positionAfter.positionAmount;
        expect(positionAmountAfter).to.be.eq(positionAmountBefore.add(ethers.utils.parseUnits('8', 18)));
    });

    it('decrease position', async () => {
        const {
            keeper,
            users: [trader],
            tradingRouter,
            executeRouter,
            tradingVault,
        } = testEnv;
        const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
        const positionAmountBefore = positionBefore.positionAmount;
        expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('18', 18));

        // Decrease position
        const increasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            triggerPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('3', 18),
        };
        const orderId = await tradingRouter.decreaseMarketOrdersIndex();
        await tradingRouter.connect(trader.signer).createDecreaseOrder(increasePositionRequest);

        await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

        const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
        const positionAmountAfter = positionAfter.positionAmount;

        expect(positionAmountAfter).to.be.eq(positionAmountBefore.sub(ethers.utils.parseUnits('3', 18)));
    });

    describe('Router: ADL cases', () => {
        const pairIndex = 0;
        let btcPriceFeed: MockPriceFeed;

        before(async () => {
            const { keeper, btc, vaultPriceFeed } = testEnv;

            const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
            const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
            btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)),
            );
        });
        after(async () => {
            const { keeper } = testEnv;

            await waitForTx(
                await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)),
            );
        });

        it('execute adl', async () => {
            const {
                deployer,
                keeper,
                users: [trader, shorter],
                usdt,
                pairVault,
                tradingRouter,
                executeRouter,
                tradingVault,
                tradingUtils,
                positionManager,
            } = testEnv;

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(traderPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            let collateral = ethers.utils.parseUnits('30000', 18);
            await mintAndApprove(testEnv, usdt, collateral, trader, tradingRouter.address);

            // trader take all indexToken
            await increaseUserPosition(
                trader,
                pairIndex,
                collateral,
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('18.66', 18),
                true,
                testEnv,
            );

            // shorter open position
            collateral = ethers.utils.parseUnits('27000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(shorter.address, collateral));
            await usdt.connect(shorter.signer).approve(positionManager.address, MAX_UINT_AMOUNT);
            await increaseUserPosition(
                shorter,
                pairIndex,
                collateral,
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('30', 18),
                false,
                testEnv,
            );

            // trader take all indexToken
            await increaseUserPosition(
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('30', 18),
                true,
                testEnv,
            );

            const pairVaultInfo = await pairVault.getVault(pairIndex);
            console.log(
                'indexTotalAmount',
                pairVaultInfo.indexTotalAmount,
                'indexReservedAmount',
                pairVaultInfo.indexReservedAmount,
            );
            expect(pairVaultInfo.indexTotalAmount.sub(pairVaultInfo.indexReservedAmount)).to.be.eq(0);

            // shorter decrease position will wait for adl
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: shorter.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: false,
                sizeAmount: ethers.utils.parseUnits('5', 18),
            };
            const decreaseOrderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(shorter.signer).createDecreaseOrder(decreasePositionRequest);

            await executeRouter.connect(keeper.signer).executeDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            const decreaseOrderInfo = await tradingRouter.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            expect(decreaseOrderInfo.needADL).to.be.eq(true);

            // execute ADL
            let traderPositionKey = await tradingUtils.getPositionKey(trader.address, pairIndex, true);
            let traderCurPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            console.log(traderCurPosition);
            await executeRouter
                .connect(keeper.signer)
                .executeADLAndDecreaseOrder(
                    [traderPositionKey],
                    [ethers.utils.parseUnits('5', 18)],
                    decreaseOrderId,
                    TradeType.MARKET,
                );
        });
    });

    describe('Router: Close position', () => {
        it('Closing position', async () => {
            const {
                keeper,
                users: [trader],
                tradingRouter,
                executeRouter,
                tradingVault,
            } = testEnv;
            const position = await tradingVault.getPosition(trader.address, pairIndex, true);

            // Closing position
            const increasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: position.positionAmount,
            };
            const orderId = await tradingRouter.decreaseMarketOrdersIndex();
            await tradingRouter.connect(trader.signer).createDecreaseOrder(increasePositionRequest);

            await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

            const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
            const positionAmountAfter = positionAfter.positionAmount;

            expect(positionAmountAfter).to.be.eq(0);
        });
    });

    describe('Router: Liquidation', () => {
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
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('30000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );
        });

        it("user's position leverage exceeded 100x, liquidated", async () => {
            const {
                deployer,
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                tradingRouter,
                tradingVault,
                tradingUtils,
                fastPriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('1000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
            await usdt.connect(trader.signer).approve(positionManager.address, MAX_UINT_AMOUNT);

            const size = collateral.div(30000).mul(100).mul(90).div(100);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
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
            const orderId = await router.increaseMarketOrdersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

            const positionBef = await tradingVault.getPosition(trader.address, pairIndex, true);

            const leverageBef = positionBef.positionAmount.div(positionBef.collateral.div(30000));
            expect(leverageBef).to.be.eq(98);
            expect(positionBef.positionAmount).to.be.eq('2999999999999999970');

            // price goes down, trader's position can be liquidated
            await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('20000', 8)));
            await waitForTx(
                await fastPriceFeed
                    .connect(keeper.signer)
                    .setPrices(
                        [btc.address],
                        [ethers.utils.parseUnits('20000', 30)],
                        (await getBlockTimestamp()) + 100,
                    ),
            );

            const leverageAft = positionBef.positionAmount.div(positionBef.collateral.div(30000 + 10000));
            expect(leverageAft).to.be.eq(131);

            // liquidation
            const traderPositionKey = tradingUtils.getPositionKey(trader.address, pairIndex, true);
            await executor.connect(keeper.signer).liquidatePositions([traderPositionKey]);

            const positionAft = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(positionAft.positionAmount).to.be.eq(0);
        });
    });
});

export async function increaseUserPosition(
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    price: BigNumber,
    size: BigNumber,
    isLong: boolean,
    testEnv: TestEnv,
) {
    const { keeper, router, executor } = testEnv;

    const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: collateral,
        openPrice: price,
        isLong: isLong,
        sizeAmount: size,
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    // await router.setHandler(user.address, true);

    const increaseOrderId = await router.increaseMarketOrdersIndex();
    await router.connect(user.signer).createIncreaseOrder(increasePositionRequest);
    await executor.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET);
}
