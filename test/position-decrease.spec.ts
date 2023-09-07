import {newTestEnv, TestEnv} from './helpers/make-suite';
import {ethers} from 'hardhat';
import {TradeType,} from '../helpers';
import {decreasePosition, increasePosition, mintAndApprove, updateBTCPrice} from './helpers/misc';
import {expect} from "chai";
import {TradingTypes} from "../types/contracts/core/Router";

describe('PositionManager: decrease position', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before('add liquidity',async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('50', 18);
        const stableAmount = ethers.utils.parseUnits('300000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('Pre transaction check: Any check failure cancels the transaction', async () => {

        before('before increase position', async () => {
            const {
                keeper,
                users: [ trader],
                usdt,
                router,
                positionManager
            } = testEnv;

            await updateBTCPrice(testEnv,'30000');

            const stableAmount = ethers.utils.parseUnits('100000', 18);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);

            const collateral = ethers.utils.parseUnits('50000', 18);
            const increaseSize = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, increaseSize, TradeType.MARKET, true);
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(position.positionAmount).to.be.eq(increaseSize);
        });

        it('check permissions, only keeper executor order', async () => {
            const {
                keeper,
                users: [trader, user1],
                router,
                executor,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('0', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const decreaseSize = ethers.utils.parseUnits('5', 18);

            // await decreasePosition(testEnv, trader, pairIndex, collateral, decreaseSize, TradeType.MARKET, true);
            const request: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: decreaseSize,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(request);
            // await executor.connect(user1.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);
            await expect(executor.connect(user1.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0)).to.be.revertedWith('opk');
        });

        it('decreaseAmount > positionAmount, trigger error: decrease amount exceed position', async ()=>{
            const {
                users: [trader],
                positionManager
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, true);

            const collateral = ethers.utils.parseUnits('0', 18);
            const decreaseSize = ethers.utils.parseUnits('11', 18);

            await expect(decreasePosition(testEnv, trader, pairIndex, collateral, decreaseSize, TradeType.MARKET, true)).to.be.revertedWith('decrease amount exceed position');
        });

        it('Insufficient LP funds', async ()=>{
            const {
                users: [trader, trader2],
                usdt,
                router,
                positionManager,
                pool
            } = testEnv;

            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(`---traderPosition: `, traderPosition);

            const valutPair = await pool.getVault(pairIndex)

            // trader2
            const stableAmount = ethers.utils.parseUnits('100000', 18);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);

            const collateral = ethers.utils.parseUnits('50000', 18);
            const increaseSize = ethers.utils.parseUnits('40', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // await increasePosition(testEnv, trader2, pairIndex, collateral, openPrice, increaseSize, TradeType.MARKET, true);
        });

        it('long > short', async () => {});
        it('long < short', async () => {});
    });

});
