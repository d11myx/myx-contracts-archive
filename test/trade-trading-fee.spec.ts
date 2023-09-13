import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, decreasePosition, mintAndApprove } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, getPositionTradingFee, getDistributeTradingFee } from '../helpers';
import { BigNumber } from 'ethers';

describe('Trade: trading fee', () => {
    describe('user paid trading fee, platform should be received trading fee and it will be distributed', () => {
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
            const indexAmount = ethers.utils.parseUnits('30000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('longer user open position, should be paid trading fee', async () => {
            const {
                users: [trader],
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('30', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);
            console.log('userUsdtBefore: ', userUsdtBefore);

            expect(userPosition.positionAmount).to.be.eq(size);

            // increase position trading fee
            let tradingFee = await positionManager.getTradingFee(pairIndex, true, userPosition.positionAmount);
            let currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                userPosition.positionAmount,
                true,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            let distributeTradingFee = await getDistributeTradingFee(testEnv, pairIndex, tradingFee);
            const increaseUserTradingFee = await positionManager.userTradingFee(trader.address);
            const increaseStakingAmount = await positionManager.stakingTradingFee();
            const increaseTreasuryFee = await positionManager.treasuryFee();

            expect(increaseUserTradingFee).to.be.eq(distributeTradingFee.userTradingFee);
            expect(increaseStakingAmount).to.be.eq(distributeTradingFee.stakingAmount);
            expect(increaseTreasuryFee).to.be.eq(distributeTradingFee.treasuryFee);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            // decrease position trading fee
            tradingFee = await positionManager.getTradingFee(pairIndex, true, userPosition.positionAmount);
            currentPositionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                userPosition.positionAmount,
                true,
            );

            expect(tradingFee).to.be.eq(currentPositionTradingFee);

            distributeTradingFee = await getDistributeTradingFee(testEnv, pairIndex, tradingFee);
            const decreaseUserTradingFee = await positionManager.userTradingFee(trader.address);
            const decreaseStakingAmount = await positionManager.stakingTradingFee();
            const decreaseTreasuryFee = await positionManager.treasuryFee();

            expect(decreaseUserTradingFee.sub(increaseUserTradingFee)).to.be.eq(distributeTradingFee.userTradingFee);
            expect(decreaseStakingAmount.sub(increaseStakingAmount)).to.be.eq(distributeTradingFee.stakingAmount);
            expect(decreaseTreasuryFee.sub(increaseTreasuryFee)).to.be.eq(distributeTradingFee.treasuryFee);

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;
            // expect(positionCollateral.sub(balanceDiff).sub(tradingFee)).to.be.eq(userFundingFee.abs());
        });
    });
});
