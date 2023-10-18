import {newTestEnv, TestEnv} from './helpers/make-suite';
import {ethers} from 'hardhat';
import {BigNumber} from 'ethers';
import {deployMockCallback, MAX_UINT_AMOUNT, TradeType, waitForTx} from '../helpers';
import {expect} from './shared/expect';
import {increasePosition, mintAndApprove, updateBTCPrice} from './helpers/misc';

describe('Router: Edge cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();

        await updateBTCPrice(testEnv, '30000');
    });
    after(async () =>{
        await updateBTCPrice(testEnv, '30000');
    });

    it('add liquidity', async () => {
        const {
            deployer,
            btc,
            usdt,
            users: [depositor],

            pool,
        } = testEnv;

        const btcAmount = ethers.utils.parseUnits('34', await btc.decimals());
        const usdtAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
        await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
        await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));
        let testCallBack = await deployMockCallback();
        const pair = await pool.getPair(pairIndex);

        await btc.connect(depositor.signer).approve(testCallBack.address, MAX_UINT_AMOUNT);
        await usdt.connect(depositor.signer).approve(testCallBack.address, MAX_UINT_AMOUNT);
        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, btcAmount, usdtAmount);

        const pairVaultInfo = await pool.getVault(pairIndex);
        // console.log(
        //     `indexTotalAmount:`,
        //     ethers.utils.formatUnits(pairVaultInfo.indexTotalAmount, await btc.decimals()),
        // );
        // console.log(
        //     `stableTotalAmount:`,
        //     ethers.utils.formatUnits(pairVaultInfo.stableTotalAmount, await usdt.decimals()),
        // );
    });

    it('open position with adding collateral', async () => {
        const {
            users: [trader],
            usdt,
            router,
            positionManager
        } = testEnv;

        const collateral = ethers.utils.parseUnits('30000', 18);
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

        const sizeAmount = ethers.utils.parseUnits('10', 18);
        const openPrice = ethers.utils.parseUnits('30000', 30);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const position = await positionManager.getPosition(trader.address, pairIndex, true);
        expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));
    });

    it('userProfit > positionValue, withdraw of partial collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
            router,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionCollateralBefore = positionBefore.collateral;

        const userPositionValue = positionBefore.positionAmount
            .mul(positionBefore.averagePrice)
            .div(ethers.utils.parseUnits('1', 30));
        const withdrawCollateral = ethers.utils.parseUnits('-10000', 18);

        // rise in BTC Price, user profit
        let btcPriceUp = '61000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userProfit = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userProfit).to.be.gt(userPositionValue);

        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral);
        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

        const userBalance = await usdt.balanceOf(trader.address);

        expect(userBalance).to.be.eq(withdrawCollateral.abs());
        expect(positionBefore.collateral.sub(withdrawCollateral.abs())).to.be.eq(positionAfter.collateral);

        await mintAndApprove(testEnv, usdt, withdrawCollateral.abs(), trader, positionManager.address);
        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral.abs());
    });

    it('userProfit < positionValue, withdraw of partial collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
            router,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

        const userPositionValue = positionBefore.positionAmount
            .mul(positionBefore.averagePrice)
            .div(ethers.utils.parseUnits('1', 30));
        const withdrawCollateral = ethers.utils.parseUnits('-10000', 18);

        // rise in BTC Price, user profit
        let btcPriceUp = '50000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userProfit = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userProfit).to.be.lt(userPositionValue);

        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral);
        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

        const userBalanceAfter = await usdt.balanceOf(trader.address);

        expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(withdrawCollateral.abs()));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(withdrawCollateral.abs()));

        await mintAndApprove(testEnv, usdt, withdrawCollateral.abs(), trader, positionManager.address);
        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral.abs());
    });

    it('userProfit > positionValue, withdraw of all collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
            router,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

        const userPositionValue = positionBefore.positionAmount
            .mul(positionBefore.averagePrice)
            .div(ethers.utils.parseUnits('1', 30));
        const withdrawCollateral = ethers.utils.parseUnits('0', 18).sub(positionBefore.collateral);

        //user profit
        let btcPriceUp = '65000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userProfit = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userProfit).to.be.gt(userPositionValue);

        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral);
        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

        const userBalanceAfter = await usdt.balanceOf(trader.address);

        expect(positionAfter.collateral).to.be.eq(0);
        expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(withdrawCollateral.abs()));

        await mintAndApprove(testEnv, usdt, withdrawCollateral.abs(), trader, positionManager.address);
        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral.abs());
    });

    it('userProfit < positionValue, withdraw of all collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
            router,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

        const userPositionValue = positionBefore.positionAmount
            .mul(positionBefore.averagePrice)
            .div(ethers.utils.parseUnits('1', 30));
        const withdrawCollateral = ethers.utils.parseUnits('0', 18).sub(positionBefore.collateral);

        let btcPriceUp = '35000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userProfit = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userProfit).to.be.lt(userPositionValue);

        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral);
        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

        const userBalanceAfter = await usdt.balanceOf(trader.address);

        expect(positionAfter.collateral).to.be.eq(0);
        expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(withdrawCollateral.abs()));

        await mintAndApprove(testEnv, usdt, withdrawCollateral.abs(), trader, positionManager.address);
        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral.abs());
    });

    it('userLoss > collateral , Unable to withdraw deposit collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const collateral = ethers.utils.parseUnits('200000', 18);
        await mintAndApprove(testEnv, usdt, collateral.abs(), trader, positionManager.address);
        await positionManager.connect(trader.signer).adjustCollateral(pairIndex, trader.address, true, collateral);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

        const withdrawCollateral = ethers.utils.parseUnits('-10000', 18);

        let btcPriceUp = '5000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userLoss = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userLoss.abs()).to.be.gt(positionBefore.collateral);

        await expect(
            positionManager
                .connect(trader.signer)
                .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral),
        ).to.be.revertedWith('collateral not enough');
    });

    it('userLoss < collateral, withdraw of partial collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const collateral = ethers.utils.parseUnits('200000', 18);
        await mintAndApprove(testEnv, usdt, collateral.abs(), trader, positionManager.address);
        await positionManager.connect(trader.signer).adjustCollateral(pairIndex, trader.address, true, collateral);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

        const withdrawCollateral = ethers.utils.parseUnits('-10000', 18);

        let btcPriceUp = '28000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userLoss = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userLoss.abs()).to.be.lt(positionBefore.collateral);

        await positionManager
            .connect(trader.signer)
            .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral);

        const userBalanceAfter = await usdt.balanceOf(trader.address);
        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

        expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(withdrawCollateral.abs()));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(withdrawCollateral.abs()));
    });

    it('userLoss < collateral, withdraw of all collateral', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
        } = testEnv;

        const exposePosition = await positionManager.getExposedPositions(pairIndex);
        expect(exposePosition).to.be.gt(0);

        const collateral = ethers.utils.parseUnits('200000', 18);
        await mintAndApprove(testEnv, usdt, collateral.abs(), trader, positionManager.address);
        await positionManager.connect(trader.signer).adjustCollateral(pairIndex, trader.address, true, collateral);

        const userBalanceBefore = await usdt.balanceOf(trader.address);
        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log(`---userBalanceBefore: `, userBalanceBefore);
        // console.log(`---positionBefore: `, positionBefore);

        const withdrawCollateral = ethers.utils.parseUnits('0', 18).sub(positionBefore.collateral);

        let btcPriceUp = '28000';
        await updateBTCPrice(testEnv, btcPriceUp);
        const userLoss = BigNumber.from(btcPriceUp).sub('30000').mul(positionBefore.positionAmount);
        expect(userLoss.abs()).to.be.lt(positionBefore.collateral);

        await expect(
            positionManager
                .connect(trader.signer)
                .adjustCollateral(pairIndex, trader.address, true, withdrawCollateral),
        ).to.be.revertedWith('collateral not enough');

        await updateBTCPrice(testEnv, '30000');
    });

});
