import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradeType } from '../helpers';
import { Position } from '../types/contracts/core/PositionManager';
import Decimal from 'decimal.js';
import { expect } from './shared/expect';
import { convertIndexAmountToStable } from '../helpers/token-decimals';
import { BigNumber } from 'ethers';

describe('Liquidation: Risk Reserve', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();

        const {
            router,
            users: [depositor],
            usdt,
            btc,
            pool,
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

    it('user loss < position collateral, risk reserve should be increased', async () => {
        const {
            keeper,
            riskReserve,
            router,
            positionManager,
            usdt,
            btc,
            users: [trader],
            liquidationLogic,
            executionLogic,
            orderManager,
        } = testEnv;
        expect(await orderManager.executionLogic()).to.be.eq(executionLogic.address);
        expect(await orderManager.liquidationLogic()).to.be.eq(liquidationLogic.address);

        const riskReserveAmountBefore = await riskReserve.getReservedAmount(usdt.address);

        const collateral = await ethers.utils.parseUnits('1000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('1', await btc.decimals());

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
        const positionBefore = await positionManager.getPositionByKey(positionKey);

        const riskBefore = await positionRisk(positionBefore);
        expect(riskBefore.needLiquidation).to.be.eq(false);

        await updateBTCPrice(testEnv, '29100');

        const riskAfter = await positionRisk(positionBefore);
        expect(riskAfter.needLiquidation).to.be.eq(true);
        expect(riskAfter.netAsset.toNumber()).to.be.gt(0);

        const userBalanceBefore = await usdt.balanceOf(trader.address);

        await liquidationLogic.connect(keeper.signer).liquidationPosition(positionKey);
        const positionAfter = await positionManager.getPositionByKey(positionKey);
        expect(positionAfter.positionAmount).to.be.eq(0);

        const userBalanceAfter = await usdt.balanceOf(trader.address);
        expect(userBalanceBefore).to.be.eq(userBalanceAfter);

        const riskReserveAmountAfter = await riskReserve.getReservedAmount(usdt.address);
        expect(riskReserveAmountAfter).to.be.eq(riskReserveAmountBefore.add(riskAfter.netAsset.toString()));
    });

    it('user loss > position collateral, risk reserve should be decreased', async () => {
        const {
            keeper,
            riskReserve,
            router,
            positionManager,
            usdt,
            btc,
            users: [trader],
            liquidationLogic,
        } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        const riskReserveAmountBefore = await riskReserve.getReservedAmount(usdt.address);

        const collateral = await ethers.utils.parseUnits('1000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('1', await btc.decimals());

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
        const positionBefore = await positionManager.getPositionByKey(positionKey);

        const riskBefore = await positionRisk(positionBefore);
        expect(riskBefore.needLiquidation).to.be.eq(false);

        await updateBTCPrice(testEnv, '29000');

        const riskAfter = await positionRisk(positionBefore);
        expect(riskAfter.needLiquidation).to.be.eq(true);
        expect(riskAfter.netAsset.toNumber()).to.be.lt(0);

        const userBalanceBefore = await usdt.balanceOf(trader.address);

        await liquidationLogic.connect(keeper.signer).liquidationPosition(positionKey, 0, 0);
        const positionAfter = await positionManager.getPositionByKey(positionKey);
        expect(positionAfter.positionAmount).to.be.eq(0);

        const userBalanceAfter = await usdt.balanceOf(trader.address);
        expect(userBalanceBefore).to.be.eq(userBalanceAfter);

        const riskReserveAmountAfter = await riskReserve.getReservedAmount(usdt.address);
        expect(riskReserveAmountAfter).to.be.eq(riskReserveAmountBefore.sub(riskAfter.netAsset.abs().toString()));
    });

    it('user loss > risk reserve balance, risk reserve should be negative', async () => {
        const {
            keeper,
            riskReserve,
            router,
            positionManager,
            usdt,
            btc,
            users: [trader],
            liquidationLogic,
        } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        const riskReserveAmountBefore = await riskReserve.getReservedAmount(usdt.address);

        const collateral = await ethers.utils.parseUnits('1000', await usdt.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const sizeAmount = ethers.utils.parseUnits('1', await btc.decimals());

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, sizeAmount, TradeType.MARKET, true);

        const positionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
        const positionBefore = await positionManager.getPositionByKey(positionKey);

        const riskBefore = await positionRisk(positionBefore);
        expect(riskBefore.needLiquidation).to.be.eq(false);

        await updateBTCPrice(testEnv, '28900');

        const riskAfter = await positionRisk(positionBefore);
        expect(riskAfter.needLiquidation).to.be.eq(true);
        expect(riskAfter.netAsset.toNumber()).to.be.lt(0);

        expect(riskAfter.netAsset.abs().gt(riskReserveAmountBefore.abs().toString())).to.be.eq(true);

        const userBalanceBefore = await usdt.balanceOf(trader.address);

        await liquidationLogic.connect(keeper.signer).liquidationPosition(positionKey, 0, 0);
        const positionAfter = await positionManager.getPositionByKey(positionKey);
        expect(positionAfter.positionAmount).to.be.eq(0);

        const userBalanceAfter = await usdt.balanceOf(trader.address);
        expect(userBalanceBefore).to.be.eq(userBalanceAfter);

        const riskReserveAmountAfter = await riskReserve.getReservedAmount(usdt.address);
        expect(riskReserveAmountAfter).to.be.eq(riskReserveAmountBefore.sub(riskAfter.netAsset.abs().toString()));
        expect(riskReserveAmountAfter).to.be.lt(0);
    });

    it('riskReserve recharge、withdraw', async () => {
        const {
            keeper,
            riskReserve,
            usdt,
            users: [user1, dao],
        } = testEnv;
        const riskReserveAmountBefore = await riskReserve.getReservedAmount(usdt.address);
        expect(riskReserveAmountBefore).to.be.lt(0);

        await expect(riskReserve.withdraw(usdt.address, keeper.address, 1)).to.be.revertedWith('insufficient balance');

        const amount = ethers.utils.parseEther('1000');
        await mintAndApprove(testEnv, usdt, amount, user1, riskReserve.address);
        await riskReserve.connect(user1.signer).recharge(usdt.address, amount);

        const riskReserveAmountAfter = await riskReserve.getReservedAmount(usdt.address);
        expect(riskReserveAmountAfter).to.be.eq(riskReserveAmountBefore.add(amount));

        const withdrawAmount = await riskReserve.getReservedAmount(usdt.address);

        await expect(
            riskReserve.connect(user1.signer).withdraw(usdt.address, dao.address, withdrawAmount),
        ).to.be.revertedWith('onlyDao');

        const daoBalanceBefore = await usdt.balanceOf(dao.address);
        const reserveBalanceBefore = await riskReserve.getReservedAmount(usdt.address);
        await riskReserve.updateDaoAddress(dao.address);

        await riskReserve.connect(dao.signer).withdraw(usdt.address, dao.address, withdrawAmount);
        const daoBalanceAfter = await usdt.balanceOf(dao.address);
        const reserveBalanceAfter = await riskReserve.getReservedAmount(usdt.address);

        expect(daoBalanceAfter).to.be.eq(daoBalanceBefore.add(withdrawAmount));
        expect(reserveBalanceAfter).to.be.eq(reserveBalanceBefore.sub(withdrawAmount));
    });

    async function positionRisk(position: Position.InfoStructOutput) {
        const { positionManager, btc, usdt, oraclePriceFeed, pool } = testEnv;

        const price = await oraclePriceFeed.getPrice(btc.address);

        const fundingFee = await positionManager.getFundingFee(position.account, position.pairIndex, position.isLong);
        const tradingFee = await positionManager.getTradingFee(
            position.pairIndex,
            position.isLong,
            position.positionAmount,
        );
        let _pnl = new Decimal(position.averagePrice.sub(price).toString())
            .mul(position.positionAmount.toString())
            .div(1e30);
        if (position.isLong) {
            _pnl = _pnl.mul(-1);
        }

        let pnl = BigNumber.from(_pnl.toString());
        if (!_pnl.eq(0)) {
            pnl = await convertIndexAmountToStable(btc, usdt, BigNumber.from(_pnl.toString()));
        }
        const netAsset = new Decimal(position.collateral.toString())
            .add(pnl.toString())
            .add(fundingFee.toString())
            .sub(tradingFee.toString());
        if (netAsset.isNegative()) {
            return { needLiquidation: true, netAsset: netAsset };
        }

        const tradingConfig = await pool.getTradingConfig(pairIndex);
        let maintainMargin = new Decimal(position.positionAmount.toString())
            .mul(position.averagePrice.toString())
            .mul(tradingConfig.maintainMarginRate.toString())
            .div(1e8)
            .div(1e30);
        maintainMargin = new Decimal(
            (await convertIndexAmountToStable(btc, usdt, BigNumber.from(maintainMargin.toString()))).toString(),
        );
        return { needLiquidation: maintainMargin.div(netAsset).gt(1), netAsset: netAsset };
    }
});
