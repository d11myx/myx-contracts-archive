import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { deployMockCallback, getPositionTradingFee, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { expect } from './shared/expect';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: Edge cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        await updateBTCPrice(testEnv, '30000');
    });
    after(async () => {
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
    });

    it('open position with adding collateral', async () => {
        const {
            keeper,
            users: [trader],
            usdt,
            btc,
            router,
            executionLogic,
            positionManager,
        } = testEnv;

        const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const traderBalanceBefore = await usdt.balanceOf(trader.address);

        const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('10', await btc.decimals()),
            tpPrice: ethers.utils.parseUnits('31000', 30),
            tp: ethers.utils.parseUnits('1', await btc.decimals()),
            slPrice: ethers.utils.parseUnits('29000', 30),
            sl: ethers.utils.parseUnits('1', await btc.decimals()),
            maxSlippage: 0,
        };
        await router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest);
        const orderId = 0;
        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.sub(collateral));
        expect(positionAfter.positionAmount).to.be.eq(
            positionBefore.positionAmount.add(ethers.utils.parseUnits('10', await btc.decimals())),
        );
    });

    it('unchanged collateral, increase position', async () => {
        const {
            keeper,
            users: [trader],
            orderManager,
            positionManager,
            router,
            btc,
            executionLogic,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const tradingFeeBefore = await positionManager.getTradingFee(pairIndex, true, positionBefore.positionAmount);
        const positionTradingFeeBefore = await getPositionTradingFee(
            testEnv,
            pairIndex,
            positionBefore.positionAmount,
            true,
        );

        expect(tradingFeeBefore).to.be.eq(positionTradingFeeBefore);

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('8', await btc.decimals()),
            maxSlippage: 0,
        };
        const orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
        await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const tradingFeeAfter = await positionManager.getTradingFee(pairIndex, true, positionAfter.positionAmount);
        const positionTradingFeeAfter = await getPositionTradingFee(
            testEnv,
            pairIndex,
            positionAfter.positionAmount,
            true,
        );

        const tradingFee = tradingFeeAfter.sub(tradingFeeBefore);

        expect(tradingFeeAfter).to.be.eq(positionTradingFeeAfter);
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(tradingFee));
        expect(positionAfter.positionAmount).to.be.eq(
            positionBefore.positionAmount.add(ethers.utils.parseUnits('8', await btc.decimals())),
        );
    });

    it('unchanged collateral, decrease position', async () => {
        const {
            users: [trader],
            positionManager,
            usdt,
            btc,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const tradingFeeBefore = await positionManager.getTradingFee(pairIndex, true, positionBefore.positionAmount);
        const positionTradingFeeBefore = await getPositionTradingFee(
            testEnv,
            pairIndex,
            positionBefore.positionAmount,
            true,
        );

        expect(tradingFeeBefore).to.be.eq(positionTradingFeeBefore);

        const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
        const decreaseAmount = ethers.utils.parseUnits('8', await btc.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);

        await decreasePosition(
            testEnv,
            trader,
            pairIndex,
            collateral,
            decreaseAmount,
            TradeType.MARKET,
            true,
            openPrice,
        );

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const tradingFeeAfter = await positionManager.getTradingFee(pairIndex, true, positionAfter.positionAmount);
        const positionTradingFeeAfter = await getPositionTradingFee(
            testEnv,
            pairIndex,
            positionAfter.positionAmount,
            true,
        );

        const tradingFee = tradingFeeAfter.sub(tradingFeeBefore).abs();

        expect(tradingFeeAfter).to.be.eq(positionTradingFeeAfter);
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(tradingFee));
        expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.sub(decreaseAmount));
    });

    it('adding collateral with unchanged position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
            router,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionCollateralBefore = positionBefore.collateral;
        const traderBalance = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 18);
        const sizeAmount = ethers.utils.parseUnits('0', await btc.decimals());
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

        const traderBalanceBefore = await usdt.balanceOf(trader.address);
        expect(traderBalanceBefore).to.be.eq(traderBalance.add(collateral));

        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.sub(collateral));
        expect(positionAfter.collateral).to.be.eq(positionCollateralBefore.add(collateral));
    });

    it('adding collateral with increase position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
            router,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeBefore = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionBefore.positionAmount,
        );
        const traderBalance = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 18);
        const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

        const traderBalanceBefore = await usdt.balanceOf(trader.address);
        expect(traderBalanceBefore).to.be.eq(traderBalance.add(collateral));

        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeAfter = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionAfter.positionAmount,
        );

        const tradingFee = positionTradingFeeAfter.sub(positionTradingFeeBefore).abs();
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.sub(collateral));
        expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.add(sizeAmount));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.add(collateral).sub(tradingFee));
    });

    it('adding collateral with decrease position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
            router,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeBefore = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionBefore.positionAmount,
        );
        const traderBalance = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 18);
        const sizeAmount = ethers.utils.parseUnits('5', await btc.decimals());

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

        const traderBalanceBefore = await usdt.balanceOf(trader.address);
        expect(traderBalanceBefore).to.be.eq(traderBalance.add(collateral));

        await decreasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, true, openPrice);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeAfter = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionAfter.positionAmount,
        );
        const tradingFee = positionTradingFeeAfter.sub(positionTradingFeeBefore).abs();
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.sub(collateral));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.add(collateral).sub(tradingFee));
        expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.sub(sizeAmount));
    });

    it('reduce collateral with unchanged position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const traderBalanceBefore = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('-10000', await usdt.decimals());
        await positionManager.connect(trader.signer).adjustCollateral(pairIndex, trader.address, true, collateral);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.add(collateral.abs()));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(collateral.abs()));
    });

    it('reduce collateral with increase position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeBefore = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionBefore.positionAmount,
        );
        const traderBalanceBefore = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('-10000', await usdt.decimals());
        const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 18);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeAfter = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionAfter.positionAmount,
        );
        const tradingFee = positionTradingFeeAfter.sub(positionTradingFeeBefore).abs();
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.add(collateral.abs()));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(collateral.abs()).sub(tradingFee));
        expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.add(sizeAmount));
    });

    it('reduce collateral with decrease position', async () => {
        const {
            users: [trader],
            usdt,
            btc,
            positionManager,
        } = testEnv;

        const positionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeBefore = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionBefore.positionAmount,
        );
        const traderBalanceBefore = await usdt.balanceOf(trader.address);

        const collateral = ethers.utils.parseUnits('-1000', await usdt.decimals());
        const sizeAmount = ethers.utils.parseUnits('5', await btc.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 18);

        await decreasePosition(testEnv, trader, pairIndex, collateral, sizeAmount, TradeType.MARKET, true, openPrice);

        const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        const positionTradingFeeAfter = await positionManager.getTradingFee(
            pairIndex,
            true,
            positionAfter.positionAmount,
        );
        const tradingFee = positionTradingFeeAfter.sub(positionTradingFeeBefore).abs();
        const traderBalanceAfter = await usdt.balanceOf(trader.address);

        expect(traderBalanceAfter).to.be.eq(traderBalanceBefore.add(collateral.abs()));
        expect(positionAfter.collateral).to.be.eq(positionBefore.collateral.sub(collateral.abs()).sub(tradingFee));
        expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.sub(sizeAmount));
    });
});
