import { SignerWithAddress, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { waitForTx } from './helpers/tx';
import { MAX_UINT_AMOUNT, TradeType } from './shared/constants';
import { ITradingRouter, PriceFeed } from '../types';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';

describe('Router: Edge cases', () => {
    const pairIndex = 0;

    before(async () => {
        const { btc, vaultPriceFeed } = testEnv;

        const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
        const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
        const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
        await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
    });
    after(async () => {});

    it('add liquidity', async () => {
        const {
            deployer,
            btc,
            usdt,
            users: [depositor],
            pairLiquidity,
            pairVault,
        } = testEnv;

        const btcAmount = ethers.utils.parseUnits('100', await btc.decimals());
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
            tradingRouter,
            executeRouter,
            tradingVault,
        } = testEnv;

        const amount = ethers.utils.parseUnits('30000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

        await usdt.connect(trader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

        const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
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

        await tradingRouter.setHandler(trader.address, true);

        await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

        const orderId = 0;
        console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

        await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

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

        const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
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
        const increasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
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
        let btcPriceFeed: PriceFeed;

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
            } = testEnv;

            const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
            expect(traderPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

            // trader take all indexToken
            await increaseUserPosition(
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('18', 18),
                true,
            );

            // shorter open position
            const collateral = ethers.utils.parseUnits('27000', 18);
            await waitForTx(await usdt.connect(deployer.signer).mint(shorter.address, collateral));
            await usdt.connect(shorter.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);
            await increaseUserPosition(
                shorter,
                pairIndex,
                collateral,
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('30', 18),
                false,
            );

            // trader take all indexToken
            await increaseUserPosition(
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseUnits('30000', 30),
                ethers.utils.parseUnits('30', 18),
                true,
            );

            const pairVaultInfo = await pairVault.getVault(pairIndex);
            expect(pairVaultInfo.indexTotalAmount.sub(pairVaultInfo.indexReservedAmount)).to.be.eq(0);

            // shorter decrease position will wait for adl
            const decreasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
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
            const increasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
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
});

export async function increaseUserPosition(
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    price: BigNumber,
    size: BigNumber,
    isLong: boolean,
) {
    const { keeper, tradingRouter, executeRouter } = testEnv;

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
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

    await tradingRouter.setHandler(user.address, true);

    const increaseOrderId = await tradingRouter.increaseMarketOrdersIndex();
    await tradingRouter.connect(user.signer).createIncreaseOrder(increasePositionRequest);
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET);
}
