import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { MAX_UINT_AMOUNT, TradeType } from '../helpers';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { TradingTypes } from '../types/contracts/core/Router';

describe('PositionManager: decrease position', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;

        // update BTC Price
        await updateBTCPrice(testEnv, '30000');

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('100', 18);
        const stableAmount = ethers.utils.parseUnits('3000000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    after(async () => {
        await updateBTCPrice(testEnv, '30000');
    });

    describe('Pre transaction check: Any check failure cancels the transaction', async () => {
        before('before increase position', async () => {
            const {
                keeper,
                users: [, trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const stableAmount = ethers.utils.parseUnits('100000', 18);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);

            const collateral = ethers.utils.parseUnits('100000', 18);
            const increaseSize = ethers.utils.parseUnits('90', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                increaseSize,
                TradeType.MARKET,
                true,
            );
            const position = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(position.positionAmount).to.be.eq(increaseSize);
        });
    });
});
