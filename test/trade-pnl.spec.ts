import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';

describe('Trade: profit & Loss', () => {
    const pairIndex = 0;
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

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10', 18);
        const stableAmount = ethers.utils.parseUnits('300000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('user profit > 0', () => {
        it('price goes up, user profit > vault balance', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                pool,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('9', 18);
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolBalance = await usdt.balanceOf(pool.address);
            const positionBalance = await usdt.balanceOf(positionManager.address);

            console.log(`poolBalance:`, ethers.utils.formatEther(poolBalance));
            console.log(`positionBalance:`, ethers.utils.formatEther(positionBalance));

            const btcPrice = '50000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount);
            console.log(`userPnl:`, userPnl);

            // positionBalance < userPnl < poolBalance
            expect(userPnl).to.be.gt(positionBalance);
            expect(userPnl).to.be.lt(poolBalance);

            //TODO should not reverted，Waiting for the contract to be fixed
            await expect(
                decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    BigNumber.from(0),
                    size,
                    TradeType.MARKET,
                    true,
                    ethers.utils.parseUnits(btcPrice, 30),
                ),
            ).to.be.revertedWith('todo: to be fixed, Insufficient vault balance');
        });
    });
});
