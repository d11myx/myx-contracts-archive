import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { abiCoder, getPoolToken } from '../helpers';
import { mintAndApprove } from './helpers/misc';
import { IPool } from '../types';
import { expect } from 'chai';
import Decimal from 'decimal.js';

describe('liquidity: ETH', () => {
    let testEnv: TestEnv, pair: IPool.PairStruct;
    const pairIndex = 2;

    before(async () => {
        testEnv = await newTestEnv();
    });

    it('addLiquidityETH、removeLiquidityETH', async () => {
        const {
            pool,
            poolView,
            router,
            weth,
            usdt,
            oraclePriceFeed,
            users: [, , , , , , , , trader],
        } = testEnv;

        pair = await pool.getPair(pairIndex);

        const { depositIndexAmount, depositStableAmount } = await poolView.getDepositAmount(
            pairIndex,
            ethers.utils.parseUnits('10000', 18),
            oraclePriceFeed.getPrice(weth.address),
        );

        // await weth.connect(trader.signer).approve(router.address, depositIndexAmount);
        await mintAndApprove(testEnv, usdt, depositStableAmount, trader, router.address);

        const ethBalanceBefore = ethers.utils.formatEther(await trader.signer.getBalance());
        const wethBalanceBefore = ethers.utils.formatEther(await weth.balanceOf(trader.address));

        expect(new Decimal(ethBalanceBefore.toString()).toFixed(2)).to.be.eq('10000.00');
        expect(new Decimal(wethBalanceBefore.toString()).toFixed()).to.be.eq('0');

        await router
            .connect(trader.signer)
            .addLiquidityETH(
                pair.indexToken,
                pair.stableToken,
                depositIndexAmount,
                depositStableAmount,
                [weth.address],
                [
                    abiCoder.encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(weth.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                ethers.utils.parseEther('10'),
                { value: depositIndexAmount.add(ethers.utils.parseEther('100')) },
            );
        const ethBalanceAfter = ethers.utils.formatEther(await trader.signer.getBalance());
        const wethBalanceAfter = ethers.utils.formatEther(await weth.balanceOf(trader.address));

        expect(new Decimal(ethBalanceAfter.toString()).toFixed(2)).to.be.eq('9897.50');
        expect(new Decimal(wethBalanceAfter.toString()).toFixed()).to.be.eq('90');

        const poolToken = await getPoolToken(await pair.pairToken);
        await poolToken.connect(trader.signer).approve(router.address, ethers.utils.parseUnits('9000', 18));
        await router
            .connect(trader.signer)
            .removeLiquidity(
                pair.indexToken,
                pair.stableToken,
                ethers.utils.parseUnits('9000', 18),
                true,
                [weth.address],
                [
                    abiCoder.encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(weth.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                { value: 1 },
            );

        const ethBalanceAfter1 = ethers.utils.formatEther(await trader.signer.getBalance());
        const wethBalanceAfter1 = ethers.utils.formatEther(await weth.balanceOf(trader.address));

        expect(new Decimal(ethBalanceAfter1.toString()).toFixed(2)).to.be.eq('9899.74');
        expect(new Decimal(wethBalanceAfter1.toString()).toFixed()).to.be.eq('90');
    });
});
