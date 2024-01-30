import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { expect } from './shared/expect';
import { getMockToken, ZERO_ADDRESS } from '../helpers';
import { BigNumber, constants } from 'ethers';
import Decimal from 'decimal.js';
import { convertIndexAmount, convertStableAmount } from '../helpers/token-decimals';

describe('LP: fair price', () => {
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

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                [0],
                { value: 1 },
            );
    });

    it('buy mlp', async () => {
        const {
            users: [, trader],
            oraclePriceFeed,
            usdt,
            btc,
            router,
            pool,
            poolView,
        } = testEnv;

        const pair = await pool.getPair(pairIndex);
        const pairPrice = await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));

        expect(pairPrice).to.be.eq(ethers.utils.parseUnits('1', 30));

        const buyLpAmount = ethers.utils.parseUnits('1000000', 18);
        const { depositIndexAmount, depositStableAmount } = await poolView.getDepositAmount(
            pairIndex,
            buyLpAmount,
            await oraclePriceFeed.getPrice(btc.address),
        );

        const expectAddLiquidity = await poolView.getMintLpAmount(
            pairIndex,
            depositIndexAmount,
            depositStableAmount,
            await oraclePriceFeed.getPrice(btc.address),
        );
        const lpToken = await getMockToken('', pair.pairToken);
        const totoalApplyBefore = await lpToken.totalSupply();

        const vaultBefore = await pool.getVault(pairIndex);
        await mintAndApprove(testEnv, btc, depositIndexAmount, trader, router.address);
        await mintAndApprove(testEnv, usdt, depositStableAmount, trader, router.address);
        const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
        const userBtcBalanceBefore = await btc.balanceOf(trader.address);
        const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

        expect(userLpBalanceBefore).to.be.eq('0');
        expect(userBtcBalanceBefore).to.be.eq(depositIndexAmount);
        expect(userUsdtBalanceBefore).to.be.eq(depositStableAmount);

        await router
            .connect(trader.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                depositIndexAmount,
                depositStableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                [0],
                { value: 1 },
            );
        const totoalApplyAfter = await lpToken.totalSupply();

        expect(totoalApplyAfter).to.be.eq(totoalApplyBefore.add(expectAddLiquidity.mintAmount));

        const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
        const userBtcBalanceAfter = await btc.balanceOf(trader.address);
        const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

        expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(depositIndexAmount));
        expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(depositStableAmount));
        expect(userLpBalanceAfter).to.be.eq(expectAddLiquidity.mintAmount);

        const vaultAfter = await pool.getVault(pairIndex);

        const totalFee = expectAddLiquidity.indexFeeAmount
            .mul(pairPrice)
            .add(expectAddLiquidity.stableFeeAmount)
            .add(expectAddLiquidity.slipAmount);
        const vaultTotalAfter = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
        const vaultTotalBefore = vaultBefore.indexTotalAmount.mul(pairPrice).add(vaultBefore.stableTotalAmount);
        const userPaid = depositIndexAmount.mul(pairPrice).add(depositStableAmount);
        const indexFeeAmount = depositIndexAmount.mul(pair.addLpFeeP).div(1e8);
        const stableFeeAmount = depositStableAmount.mul(pair.addLpFeeP).div(1e8);
        const totalFeeAmount = (await convertIndexAmount(btc, indexFeeAmount, 18)).add(
            await convertStableAmount(usdt, stableFeeAmount, 18),
        );
        let slipAmount = BigNumber.from(0);
        if (expectAddLiquidity.slipToken == pair.indexToken) {
            slipAmount = await convertIndexAmount(btc, expectAddLiquidity.slipAmount, 18);
        } else if (expectAddLiquidity.slipToken == pair.stableToken) {
            slipAmount = await convertStableAmount(usdt, expectAddLiquidity.slipAmount, 18);
        }
        expect(
            (await convertIndexAmount(btc, expectAddLiquidity.afterFeeIndexAmount, 18))
                .add(await convertStableAmount(usdt, expectAddLiquidity.afterFeeStableAmount, 18))
                .add(totalFeeAmount)
                .add(slipAmount),
        ).to.be.eq(
            (await convertIndexAmount(btc, depositIndexAmount, 18)).add(
                await convertStableAmount(usdt, depositStableAmount, 18),
            ),
        );
        expect(userPaid.add(vaultTotalBefore)).to.be.eq(vaultTotalAfter.add(totalFee));
    });

    it('sell mlp', async () => {
        const {
            users: [, trader],
            usdt,
            btc,
            router,
            pool,
            poolView,
            oraclePriceFeed,
        } = testEnv;

        const lpPrice = await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
        const pairPrice = BigNumber.from(
            ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
        );

        const pair = await pool.getPair(pairIndex);
        const lpToken = await getMockToken('', pair.pairToken);
        const vaultBefore = await pool.getVault(pairIndex);
        const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
        const sellLpAmount = userLpBalanceBefore;
        const userBtcBalanceBefore = await btc.balanceOf(trader.address);
        const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);
        const {
            receiveIndexTokenAmount,
            receiveStableTokenAmount,
            feeAmount,
            feeIndexTokenAmount,
            feeStableTokenAmount,
        } = await poolView.getReceivedAmount(pairIndex, sellLpAmount, await oraclePriceFeed.getPrice(btc.address));

        await lpToken.connect(trader.signer).approve(router.address, constants.MaxUint256);
        await router
            .connect(trader.signer)
            .removeLiquidity(
                pair.indexToken,
                pair.stableToken,
                sellLpAmount,
                false,
                [btc.address],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                { value: 1 },
            );
        const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
        const userBtcBalanceAfter = await btc.balanceOf(trader.address);
        const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);
        const vaultAfter = await pool.getVault(pairIndex);

        expect(userLpBalanceAfter).to.be.eq(userLpBalanceBefore.sub(sellLpAmount));
        expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.add(receiveIndexTokenAmount));
        expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.add(receiveStableTokenAmount));

        const vaultTotal = (await convertIndexAmount(btc, receiveIndexTokenAmount.mul(pairPrice), 18))
            .add(await convertStableAmount(usdt, receiveStableTokenAmount, 18))
            .add(await convertStableAmount(usdt, feeAmount, 18));
        const userPaid = sellLpAmount.mul(lpPrice).div('1000000000000000000000000000000');

        expect(new Decimal(ethers.utils.formatEther(userPaid)).toFixed(0)).to.be.eq(
            new Decimal(ethers.utils.formatEther(vaultTotal)).toFixed(0),
        );

        expect(vaultAfter.indexTotalAmount).to.be.eq(
            vaultBefore.indexTotalAmount.sub(receiveIndexTokenAmount).sub(feeIndexTokenAmount),
        );
        expect(vaultAfter.stableTotalAmount).to.be.eq(
            vaultBefore.stableTotalAmount.sub(receiveStableTokenAmount).sub(feeStableTokenAmount),
        );
    });
});
