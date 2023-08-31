import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { mintAndApprove, decreasePosition, increasePosition } from './helpers/misc';
import { BigNumber } from 'ethers';
import { increase, Duration, getBlockTimestamp } from '../helpers/utilities/tx';

describe('Funding Fee', () => {
    const pairIndex = 0;

    before(async () => {
        const {
            users: [depositor],
            btc,
            usdt,
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
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    it('long position pay', async () => {
        const {
            deployer,
            users: [long, short],
            usdt,
            router,
            positionManager
        } = testEnv;
        const collateral = ethers.utils.parseUnits('10000', 18);
        const price = ethers.utils.parseUnits('30000', 30);

        /* increase long position */
        await waitForTx(await usdt.connect(deployer.signer).mint(long.address, collateral));
        await usdt.connect(long.signer).approve(router.address, MAX_UINT_AMOUNT);
        await increasePosition(
            testEnv,
            long,
            pairIndex,
            collateral,
            price,
            ethers.utils.parseUnits('5', 18),
            TradeType.MARKET,
            true
        );
        const longPosition = await positionManager.getPosition(long.address, pairIndex, true);
        console.log(`long position:`, longPosition);

        expect(longPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

        /* increase short position */
        await waitForTx(await usdt.connect(deployer.signer).mint(short.address, collateral));
        await usdt.connect(short.signer).approve(router.address, MAX_UINT_AMOUNT);
        await increasePosition(
            testEnv,
            short,
            pairIndex,
            collateral,
            price,
            ethers.utils.parseUnits('5', 18),
            TradeType.MARKET,
            false
        );
        const shortPosition = await positionManager.getPosition(short.address, pairIndex, false);
        console.log(`short position:`, shortPosition);

        expect(shortPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

        /* increase timestamp and update fundingRate */
        const currentTimestamp = await getBlockTimestamp();
        await increase(Duration.hours(8));
        const latestTimestamp = await getBlockTimestamp();
        const diffTimestamp = latestTimestamp - currentTimestamp;
        console.log(`currentTimestamp: ${currentTimestamp}, latestTimestamp: ${latestTimestamp}`);
        expect(diffTimestamp).to.be.gte(28800);

        // const longTracker = await positionManager.longTracker(pairIndex);
        // const shortTracker = await positionManager.shortTracker(pairIndex);
        // console.log(`longTracker: ${longTracker}, shortTracker: ${shortTracker}`);

        await positionManager.updateFundingRate(pairIndex, price);

        const oldLongBalance = await usdt.balanceOf(long.address);
        const oldShortBalance = await usdt.balanceOf(short.address);
        /* decrease position */
        await decreasePosition(
            testEnv,
            long,
            pairIndex,
            BigNumber.from(0),
            longPosition.positionAmount,
            TradeType.MARKET,
            true,
        );

        await decreasePosition(
            testEnv,
            short,
            pairIndex,
            BigNumber.from(0),
            shortPosition.positionAmount,
            TradeType.MARKET,
            false,
        );

        const latestLongBalance = await usdt.balanceOf(long.address);
        const latestShortBalance = await usdt.balanceOf(short.address);
        const diffLongBalance = latestLongBalance.sub(oldLongBalance);
        const diffShortBalance = latestShortBalance.sub(oldShortBalance);
        console.log(`oldLongBalance: ${oldLongBalance}, latestLongBalance: ${latestLongBalance}, diffLongBalance: ${diffLongBalance}`);
        console.log(`oldShortBalance: ${oldShortBalance}, latestShortBalance: ${latestShortBalance}, diffShortBalance: ${diffShortBalance}`);

        const longTradingFee = await positionManager.getTradingFee(pairIndex, true, longPosition.positionAmount);
        const shortTradingFee = await positionManager.getTradingFee(pairIndex, false, shortPosition.positionAmount);
        console.log(`longTradingFee: ${longTradingFee}, shortTradingFee: ${shortTradingFee}`);

        const longFundingFee = diffLongBalance.sub(longPosition.collateral).abs().sub(longTradingFee);
        const shortFundingFee = diffShortBalance.sub(shortPosition.collateral).abs().sub(shortTradingFee);

        console.log(`longFundingFee: ${longFundingFee}, shortFundingFee: ${shortFundingFee}`);

    });
});
