import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber, constants } from 'ethers';
import { getMockToken, TradeType } from '../helpers';

describe('LP: Pool cases', () => {
    const pairIndex = 1;
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
                positionManager,
            } = testEnv;

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            // add liquidity   增加流动性
            const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals()); //单价3w
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals()); //单价1
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
            expect(await pool.lpFairPrice(pairIndex)).to.be.eq(ethers.utils.parseUnits('1000000000000'));
            const vaultBefore = await pool.getVault(pairIndex);
            const userBtcBalanceBefore = await btc.balanceOf(depositor.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(depositor.address);
            expect(vaultBefore.indexTotalAmount).to.be.eq(0);
            expect(vaultBefore.stableTotalAmount).to.be.eq(0);

            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);
            // expect(expectAddLiquidity.mintAmount).to.be.eq(ethers.utils.parseUnits('599400000'));
            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            const lpToken = await getMockToken('', pair.pairToken);
            const totoalApply = await lpToken.totalSupply();
            //expect(totoalApply).to.be.eq(ethers.utils.parseUnits('599400000'));
            const userLpBalanceBefore = await lpToken.balanceOf(depositor.address);
            // expect(userLpBalanceBefore).to.be.eq(ethers.utils.parseUnits('599400000'));
            const vaultAfter = await pool.getVault(pairIndex);
            const userBtcBalanceAfter = await btc.balanceOf(depositor.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(depositor.address);

            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            // 100: 50
            //expect(vaultAfter.indexTotalAmount.mul(pairPrice)).to.be.eq(vaultAfter.stableTotalAmount);

            // userPaid = actual vaultTotal + totalFee
            const totalFee = expectAddLiquidity.indexFeeAmount.mul(pairPrice).add(expectAddLiquidity.stableFeeAmount);
            const vaultTotal = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            expect(userPaid).to.be.eq(vaultTotal.add(totalFee));

            // console.log('===================');
            // console.log(await positionManager.getNextFundingRate(pairIndex));
        });
    });
});
