import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber, constants } from 'ethers';
import { getMockToken, log, TradeType } from '../helpers';
import {
    convertIndexAmount,
    convertIndexAmountToStable,
    convertStableAmount,
    convertStableAmountToIndex,
} from '../helpers/token-decimals';

describe('Sing-lp: Test cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;
    const MAX_DECIMALS = 18;
    const PRICE_DECIMALS = 30; // 预言机价格精度

    before(async () => {
        testEnv = await newTestEnv();
    });

    describe('test of pool', () => {
        it('should add liquidity success', async () => {
            const {
                router,
                users: [depositor],
                usdt,
                btc,
                pairTokens,
                pool,
                poolView,
                oraclePriceFeed,
            } = testEnv;

            const indexPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            const lpPrice = await poolView.lpFairPrice(1, await oraclePriceFeed.getPrice(btc.address));
            // console.log(pairPrice);

            // value 1:100
            const addIndexAmount = ethers.utils.parseUnits('10000', await btc.decimals()); // per 30000U
            const addStableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals()); // per 1U
            const pair = await pool.getPair(pairIndex);
            // mint test coin
            await mintAndApprove(testEnv, btc, addIndexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

            const lpAmountStrut = await poolView.getMintLpAmount(
                pairIndex,
                addIndexAmount,
                addStableAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );

            // console.log(lpAmountStrut.mintAmount);

            await router.connect(depositor.signer).addLiquidity(
                pair.indexToken,
                pair.stableToken,
                addIndexAmount,
                addStableAmount,
                [btc.address], // the token need update price
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits(indexPrice.toString(), 8)])], // update data(price)
                { value: 1 },
            );

            // common token transfer check
            expect(await btc.balanceOf(depositor.address)).to.be.eq(ethers.utils.parseUnits('0'));
            expect(await usdt.balanceOf(depositor.address)).to.be.eq(ethers.utils.parseUnits('0'));
            expect(await btc.balanceOf(pool.address)).to.be.eq(addIndexAmount);
            expect(await usdt.balanceOf(pool.address)).to.be.eq(addStableAmount);

            // lp token transfer check
            const lpToken = await getMockToken('', pair.pairToken);
            // console.log(ethers.utils.formatUnits(await lpToken.balanceOf(depositor.address)));
            expect(await lpToken.balanceOf(depositor.address)).to.be.eq(lpAmountStrut.mintAmount);

            // pool states check value = 1:100
            const poolVault = await pool.getVault(pairIndex);
            expect(poolVault.indexTotalAmount.mul(indexPrice)).to.be.eq(
                await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount),
            );

            // fee check
            const btcFee = await pool.feeTokenAmounts(btc.address);
            const stableFee = await pool.feeTokenAmounts(usdt.address);
            const feeRate = pair.addLpFeeP;

            expect(btcFee).to.be.eq(addIndexAmount.mul(feeRate).div(1e8));
            expect(stableFee).to.be.eq(addStableAmount.mul(feeRate).div(1e8));

            // total amount check
            expect(addIndexAmount).to.be.eq(poolVault.indexTotalAmount.add(btcFee));
            expect(addStableAmount).to.be.eq(poolVault.stableTotalAmount.add(stableFee));
        });

        // it('should remove liquidity success', async () => {

        // });
    });
});
