import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';
import Decimal from 'decimal.js';

describe('Trade: profit & Loss', () => {
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
        const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
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

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolBalance = await usdt.balanceOf(pool.address);
            const positionBalance = await usdt.balanceOf(positionManager.address);

            const btcPrice = '50000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount);

            // positionBalance < userPnl < poolBalance
            expect(userPnl).to.be.gt(positionBalance);
            expect(userPnl).to.be.lt(poolBalance);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                size,
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
        });

        it('user has profit, decrease position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            btcPrice = '50000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPositionBefore.positionAmount);
            expect(userPnl).to.be.gt(0);

            const decreasingCollateral = BigNumber.from(0).sub(userPositionBefore.collateral.mul(99).div(100));
            const decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            const { executeReceipt } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                decreasingCollateral,
                decreasingSize, // decrease 99%
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
            const pnl = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'pnl');
            const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
            const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');

            const userPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(userPositionAfter.positionAmount).to.be.eq(userPositionBefore.positionAmount.sub(decreasingSize));
            expect(userPositionAfter.collateral).to.be.eq(
                userPositionBefore.collateral
                    .add(pnl)
                    .sub(BigNumber.from(tradingFee).abs())
                    .add(BigNumber.from(fundingFee))
                    .sub(decreasingCollateral.abs()),
            );
        });
    });

    describe('user profit < 0', () => {
        it('user has loss, decrease position', async () => {
            const {
                users: [, , trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            btcPrice = '28000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnlBef = BigNumber.from(btcPrice).sub('30000').mul(userPositionBefore.positionAmount);
            expect(userPnlBef).to.be.lt(0);

            const riskBefore = new Decimal(9)
                .mul(new Decimal(30000))
                .mul(1)
                .div(100)
                .div(new Decimal(30000).add(new Decimal(userPnlBef.toString()).div(1e18)));
            expect(riskBefore.toString()).to.be.eq('0.225');

            let decreasingCollateral = BigNumber.from(0).sub(userPositionBefore.collateral.mul(99).div(100));
            let decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            await expect(
                decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    decreasingCollateral,
                    decreasingSize, // decrease 99%
                    TradeType.MARKET,
                    true,
                    ethers.utils.parseUnits(btcPrice, 30),
                ),
            ).to.be.revertedWith('collateral not enough');

            decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            const availableCollateral = userPositionBefore.collateral
                .add(userPnlBef)
                .sub(await positionManager.getTradingFee(pairIndex, true, decreasingSize.abs()));
            decreasingCollateral = BigNumber.from(0).sub(availableCollateral.mul(99).div(100));
            const { executeReceipt } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                decreasingCollateral,
                decreasingSize, // decrease 99%
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
            const pnl = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'pnl');
            const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
            const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');

            const userPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(userPositionAfter.positionAmount).to.be.eq(userPositionBefore.positionAmount.sub(decreasingSize));
            expect(userPositionAfter.collateral).to.be.eq(
                userPositionBefore.collateral.add(pnl).sub(tradingFee).add(fundingFee).sub(decreasingCollateral.abs()),
            );

            const sizeAfter = new Decimal(userPositionAfter.positionAmount.toString()).div(1e18);
            const avgPriceAfter = new Decimal(userPositionAfter.averagePrice.toString()).div(1e30);
            const collateralAfter = new Decimal(userPositionAfter.collateral.toString()).div(1e18);
            const userPnlAft = BigNumber.from(btcPrice)
                .sub(avgPriceAfter.toString())
                .mul(userPositionAfter.positionAmount);

            const riskAfter = new Decimal(sizeAfter)
                .mul(new Decimal(avgPriceAfter))
                .mul(1)
                .div(100)
                .div(new Decimal(collateralAfter).add(new Decimal(userPnlAft.toString()).div(1e18)));
            expect(riskAfter.toFixed(2)).to.be.eq('0.23');
        });
    });
});
