import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber, constants } from 'ethers';
import { getMockToken, TradeType } from '../helpers';

describe('LP: Pool cases', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
    });

    describe('liquidity of pool', () => {
        it('should increased correct liquidity', async () => {
            const {
                router,
                users: [depositor],
                usdt,
                btc,
                pool,
                oraclePriceFeed,
            } = testEnv;

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            const vaultBefore = await pool.getVault(pairIndex);
            const userBtcBalanceBefore = await btc.balanceOf(depositor.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(depositor.address);
            expect(vaultBefore.indexTotalAmount).to.be.eq(0);
            expect(vaultBefore.stableTotalAmount).to.be.eq(0);

            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);
            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            const vaultAfter = await pool.getVault(pairIndex);
            const userBtcBalanceAfter = await btc.balanceOf(depositor.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(depositor.address);

            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            // 50: 50
            expect(vaultAfter.indexTotalAmount.mul(pairPrice)).to.be.eq(vaultAfter.stableTotalAmount);

            // userPaid = actual vaultTotal + totalFee
            const totalFee = expectAddLiquidity.indexFeeAmount.mul(pairPrice).add(expectAddLiquidity.stableFeeAmount);
            const vaultTotal = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            expect(userPaid).to.be.eq(vaultTotal.add(totalFee));
        });

        it('should decreased correct liquidity', async () => {
            const {
                router,
                users: [depositor],
                usdt,
                btc,
                pool,
                oraclePriceFeed,
            } = testEnv;
            const pair = await pool.getPair(pairIndex);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            const lpPrice = BigNumber.from(
                ethers.utils.formatUnits(await pool.lpFairPrice(pairIndex), 30).replace('.0', ''),
            );

            const lpToken = await getMockToken('', pair.pairToken);

            const vaultBefore = await pool.getVault(pairIndex);
            const userBtcBalanceBefore = await btc.balanceOf(depositor.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(depositor.address);
            const userLpBalanceBefore = await lpToken.balanceOf(depositor.address);

            const lpAmount = ethers.utils.parseEther('30000');
            const expectRemoveLiquidity = await pool.getReceivedAmount(pairIndex, lpAmount);
            await lpToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router.connect(depositor.signer).removeLiquidity(pair.indexToken, pair.stableToken, lpAmount);

            const vaultAfter = await pool.getVault(pairIndex);
            const userBtcBalanceAfter = await btc.balanceOf(depositor.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(depositor.address);
            const userLpBalanceAfter = await lpToken.balanceOf(depositor.address);

            expect(userLpBalanceAfter).to.be.eq(userLpBalanceBefore.sub(lpAmount));

            expect(userBtcBalanceAfter).to.be.eq(
                userBtcBalanceBefore.add(expectRemoveLiquidity.receiveIndexTokenAmount),
            );
            expect(userUsdtBalanceAfter).to.be.eq(
                userUsdtBalanceBefore.add(expectRemoveLiquidity.receiveStableTokenAmount),
            );

            // userPaid = actual vaultTotal
            const vaultTotal = expectRemoveLiquidity.receiveIndexTokenAmount
                .mul(pairPrice)
                .add(expectRemoveLiquidity.receiveStableTokenAmount);
            const userPaid = lpAmount.mul(lpPrice);
            expect(userPaid).to.be.eq(vaultTotal);

            expect(vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount)).to.be.eq(
                vaultBefore.indexTotalAmount.mul(pairPrice).add(vaultBefore.stableTotalAmount).sub(lpAmount),
            );
        });
    });

    describe('long short tracker', () => {
        before(async () => {
            const {
                users: [depositor],
                btc,
                usdt,
                pool,
                router,
            } = testEnv;
            // add liquidity
            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('long tracker increased, lock available long liquidity', async () => {
            const {
                users: [, trader],
                btc,
                usdt,
                router,
                pool,
                oraclePriceFeed,
            } = testEnv;

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            const vaultBefore = await pool.getVault(pairIndex);
            const availableLongBefore = vaultBefore.indexTotalAmount
                .sub(vaultBefore.indexReservedAmount)
                .mul(pairPrice);
            // const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

            // open position
            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const vaultAfter = await pool.getVault(pairIndex);
            const availableLongAfter = vaultAfter.indexTotalAmount.sub(vaultAfter.indexReservedAmount).mul(pairPrice);
            // const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

            expect(availableLongAfter).to.be.eq(availableLongBefore.sub(size.mul(pairPrice)));
        });

        it('long tracker decreased, unlock available long liquidity', async () => {
            const {
                users: [, trader],
                btc,
                usdt,
                router,
                pool,
                oraclePriceFeed,
            } = testEnv;

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            const vaultBefore = await pool.getVault(pairIndex);
            const availableLongBefore = vaultBefore.indexTotalAmount
                .sub(vaultBefore.indexReservedAmount)
                .mul(pairPrice);
            // const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

            // open position
            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('10', 18);
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await decreasePosition(testEnv, trader, pairIndex, collateral, size, TradeType.MARKET, true);

            const vaultAfter = await pool.getVault(pairIndex);
            const availableLongAfter = vaultAfter.indexTotalAmount.sub(vaultAfter.indexReservedAmount).mul(pairPrice);
            // const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

            expect(availableLongAfter).to.be.eq(availableLongBefore.add(size.mul(pairPrice)));
        });

        it('long tracker -> short tracker, unlock all long liquidity, lock short liquidity', async () => {});

        it('short tracker -> long tracker, unlock all short liquidity, lock long liquidity', async () => {});

        it('short tracker increased, lock available short liquidity', async () => {});

        it('short tracker decreased, unlock available short liquidity', async () => {});
    });
});
