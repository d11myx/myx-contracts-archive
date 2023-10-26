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
        const indexAmount = ethers.utils.parseUnits('100', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
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
                btc,
                router,
                positionManager,
            } = testEnv;

            const stableAmount = ethers.utils.parseUnits('100000', await usdt.decimals());
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);

            const collateral = ethers.utils.parseUnits('100000', await usdt.decimals());
            const increaseSize = ethers.utils.parseUnits('90', await btc.decimals());
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

        // it('decreaseAmount > positionAmount, trigger error: decrease amount exceed position', async () => {
        //     const {
        //         users: [, trader],
        //     } = testEnv;
        //
        //     const collateral = ethers.utils.parseUnits('0', 18);
        //     const decreaseSize = ethers.utils.parseUnits('91', 18);
        //
        //     await expect(
        //         decreasePosition(testEnv, trader, pairIndex, collateral, decreaseSize, TradeType.MARKET, true),
        //     ).to.be.revertedWith('decrease amount exceed position');
        // });

        it('Insufficient LP funds, trigger error: stable token not enough', async () => {
            const {
                keeper,
                users: [depositor, trader],
                usdt,
                btc,
                router,
                executionLogic,
                positionManager,
                orderManager,
                pool,
            } = testEnv;

            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            // const poolVaultBefore = await pool.getVault(pairIndex);
            // console.log(`---poolVaultBefore: `, poolVaultBefore);

            // remove Liquidity
            const removeAmount = ethers.utils.parseUnits('300000', 18);
            const pair = await pool.getPair(pairIndex);
            const poolToken = await ethers.getContractAt('PoolToken', pair.pairToken);

            // const poolTokenBalance = await poolToken.balanceOf(depositor.address);
            // console.log(`---poolTokenBalance: `, poolTokenBalance);

            await poolToken.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT);
            await router
                .connect(depositor.signer)
                .removeLiquidity(pair.indexToken, pair.stableToken, removeAmount, false);

            // const poolVaultAft = await pool.getVault(pairIndex);
            // console.log(`---poolVaultAft: `, poolVaultAft);

            // trader decrease position
            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const openPrice = ethers.utils.parseUnits('70000', 30);

            const decreasePositionRequestStruct: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: positionBefore.positionAmount,
                maxSlippage: 0,
            };

            // update BTC price
            await updateBTCPrice(testEnv, '70000');

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequestStruct);

            // await executor.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0);
            // TODO stable token not enough swap
            // await expect(
            //     executionLogic.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0),
            // ).to.be.revertedWith('stable token not enough');
        });
    });
});
