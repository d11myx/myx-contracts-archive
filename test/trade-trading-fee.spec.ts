import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, decreasePosition, mintAndApprove } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, getPositionTradingFee, getDistributeTradingFee } from '../helpers';
import { BigNumber } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Trade: trading fee', () => {
    describe('user paid trading fee, platform should be received trading fee and it will be distributed', () => {
        const pairIndex = 0;
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
            const indexAmount = ethers.utils.parseUnits('30000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('should distribute trading fee', async () => {
            const {
                users: [trader],
                keeper,
                usdt,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const size = ethers.utils.parseUnits('30', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const userUsdtTotal = await usdt.balanceOf(trader.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const userUsdtBefore = await usdt.balanceOf(trader.address);

            // increase position trading fee
            let tradingFee = await positionManager.getTradingFee(pairIndex, true, userPosition.positionAmount);
            let positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, userPosition.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            let distributeTradingFee = await getDistributeTradingFee(testEnv, pairIndex, tradingFee);
            const increaseUserTradingFee = await positionManager.userTradingFee(trader.address);
            const increaseKeeperTradingFee = await positionManager.userTradingFee(keeper.address);
            const increaseStakingAmount = await positionManager.stakingTradingFee();
            const increaseTreasuryFee = await positionManager.treasuryFee();

            expect(increaseUserTradingFee).to.be.eq(distributeTradingFee.userTradingFee);
            expect(increaseKeeperTradingFee).to.be.eq(distributeTradingFee.keeperAmount);
            expect(increaseStakingAmount).to.be.eq(distributeTradingFee.stakingAmount);
            expect(increaseTreasuryFee).to.be.eq(distributeTradingFee.treasuryFee);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userPosition.positionAmount,
                TradeType.MARKET,
                true,
            );

            const userUsdtAfter = await usdt.balanceOf(trader.address);
            const balanceDiff = userUsdtAfter.sub(userUsdtBefore);
            const positionCollateral = userPosition.collateral;

            expect(positionCollateral.sub(balanceDiff)).to.be.eq(tradingFee);
            expect(userUsdtTotal.sub(tradingFee.mul(2).abs())).to.be.eq(userUsdtAfter);
        });

        it('should received vip trading fee', async () => {
            const {
                users: [trader, trader2, trader3, trader4, trader5, trader6],
                usdt,
                router,
                positionManager,
                executionLogic,
                orderManager,
                keeper,
            } = testEnv;

            const normal = 0;
            const vip1 = 1;
            const vip2 = 2;
            const vip3 = 3;
            const vip4 = 4;
            const vip5 = 5;
            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('30', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // vip = 0
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, normal, 0);
            const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            // vip = 1
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const increasePositionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest2);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip1, 0);
            const trader2Position = await positionManager.getPosition(trader2.address, pairIndex, true);

            // vip = 2
            await mintAndApprove(testEnv, usdt, collateral, trader3, router.address);
            const increasePositionRequest3: TradingTypes.IncreasePositionRequestStruct = {
                account: trader3.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader3.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest3);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip2, 0);
            const trader3Position = await positionManager.getPosition(trader3.address, pairIndex, true);

            // vip = 3
            await mintAndApprove(testEnv, usdt, collateral, trader4, router.address);
            const increasePositionRequest4: TradingTypes.IncreasePositionRequestStruct = {
                account: trader4.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader4.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest4);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip3, 0);
            const trader4Position = await positionManager.getPosition(trader4.address, pairIndex, true);

            // vip = 4
            await mintAndApprove(testEnv, usdt, collateral, trader5, router.address);
            const increasePositionRequest5: TradingTypes.IncreasePositionRequestStruct = {
                account: trader5.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader5.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest5);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip4, 0);
            const trader5Position = await positionManager.getPosition(trader5.address, pairIndex, true);

            // vip = 5
            await mintAndApprove(testEnv, usdt, collateral, trader6, router.address);
            const increasePositionRequest6: TradingTypes.IncreasePositionRequestStruct = {
                account: trader6.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };

            orderId = await orderManager.ordersIndex();
            await router.connect(trader6.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest6);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, vip5, 0);
            const trader6Position = await positionManager.getPosition(trader6.address, pairIndex, true);

            // trading fee
            let tradingFee = await positionManager.getTradingFee(pairIndex, true, traderPosition.positionAmount);
            let positionTradingFee = await getPositionTradingFee(
                testEnv,
                pairIndex,
                traderPosition.positionAmount,
                true,
            );

            expect(tradingFee).to.be.eq(positionTradingFee);

            tradingFee = await positionManager.getTradingFee(pairIndex, true, trader2Position.positionAmount);
            positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, trader2Position.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            tradingFee = await positionManager.getTradingFee(pairIndex, true, trader3Position.positionAmount);
            positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, trader3Position.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            tradingFee = await positionManager.getTradingFee(pairIndex, true, trader4Position.positionAmount);
            positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, trader4Position.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            tradingFee = await positionManager.getTradingFee(pairIndex, true, trader5Position.positionAmount);
            positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, trader5Position.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            tradingFee = await positionManager.getTradingFee(pairIndex, true, trader6Position.positionAmount);
            positionTradingFee = await getPositionTradingFee(testEnv, pairIndex, trader6Position.positionAmount, true);

            expect(tradingFee).to.be.eq(positionTradingFee);

            // vip amount
            const normalAmount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee)).userTradingFee;
            const vip1Amount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee, vip1)).userTradingFee;
            const vip2Amount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee, vip2)).userTradingFee;
            const vip3Amount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee, vip3)).userTradingFee;
            const vip4Amount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee, vip4)).userTradingFee;
            const vip5Amount = (await getDistributeTradingFee(testEnv, pairIndex, tradingFee, vip5)).userTradingFee;

            const traderTradingFee = await positionManager.userTradingFee(trader.address);
            const trader2TradingFee = await positionManager.userTradingFee(trader2.address);
            const trader3TradingFee = await positionManager.userTradingFee(trader3.address);
            const trader4TradingFee = await positionManager.userTradingFee(trader4.address);
            const trader5TradingFee = await positionManager.userTradingFee(trader5.address);
            const trader6TradingFee = await positionManager.userTradingFee(trader6.address);

            expect(normalAmount).to.be.eq(traderTradingFee);
            expect(vip1Amount).to.be.eq(trader2TradingFee);
            expect(vip2Amount).to.be.eq(trader3TradingFee);
            expect(vip3Amount).to.be.eq(trader4TradingFee);
            expect(vip4Amount).to.be.eq(trader5TradingFee);
            expect(vip5Amount).to.be.eq(trader6TradingFee);

            // decrease position
            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
            await decreasePosition(
                testEnv,
                trader2,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
            await decreasePosition(
                testEnv,
                trader3,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
            await decreasePosition(
                testEnv,
                trader4,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
            await decreasePosition(
                testEnv,
                trader5,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
            await decreasePosition(
                testEnv,
                trader6,
                pairIndex,
                BigNumber.from(0),
                traderPosition.positionAmount,
                TradeType.MARKET,
                true,
            );
        });

        it('claim trading fee', async () => {
            const {
                users: [trader, trader2, trader3, trader4, trader5, trader6, poolAdmin],
                usdt,
                positionManager,
                keeper,
                roleManager,
            } = testEnv;

            // trading fee
            const traderTradingFee = await positionManager.userTradingFee(trader.address);
            const trader2TradingFee = await positionManager.userTradingFee(trader2.address);
            const trader3TradingFee = await positionManager.userTradingFee(trader3.address);
            const trader4TradingFee = await positionManager.userTradingFee(trader4.address);
            const trader5TradingFee = await positionManager.userTradingFee(trader5.address);
            const trader6TradingFee = await positionManager.userTradingFee(trader6.address);
            const keeperTradingFee = await positionManager.userTradingFee(keeper.address);

            // before balance
            const keeperBalanceBefore = await usdt.balanceOf(keeper.address);
            const traderBalanceBefore = await usdt.balanceOf(trader.address);
            const trader2BalanceBefore = await usdt.balanceOf(trader2.address);
            const trader3BalanceBefore = await usdt.balanceOf(trader3.address);
            const trader4BalanceBefore = await usdt.balanceOf(trader4.address);
            const trader5BalanceBefore = await usdt.balanceOf(trader5.address);
            const trader6BalanceBefore = await usdt.balanceOf(trader6.address);

            /// claim trading fee
            await positionManager.connect(keeper.signer).claimKeeperTradingFee();
            await positionManager.connect(trader.signer).claimUserTradingFee();
            await positionManager.connect(trader2.signer).claimUserTradingFee();
            await positionManager.connect(trader3.signer).claimUserTradingFee();
            await positionManager.connect(trader4.signer).claimUserTradingFee();
            await positionManager.connect(trader5.signer).claimUserTradingFee();
            await positionManager.connect(trader6.signer).claimUserTradingFee();

            // after balance
            const keeperBalanceAfter = await usdt.balanceOf(keeper.address);
            const traderBalanceAfter = await usdt.balanceOf(trader.address);
            const trader2BalanceAfter = await usdt.balanceOf(trader2.address);
            const trader3BalanceAfter = await usdt.balanceOf(trader3.address);
            const trader4BalanceAfter = await usdt.balanceOf(trader4.address);
            const trader5BalanceAfter = await usdt.balanceOf(trader5.address);
            const trader6BalanceAfter = await usdt.balanceOf(trader6.address);

            expect(keeperBalanceBefore.add(keeperTradingFee)).to.be.eq(keeperBalanceAfter);
            expect(traderBalanceBefore.add(traderTradingFee)).to.be.eq(traderBalanceAfter);
            expect(trader2BalanceBefore.add(trader2TradingFee)).to.be.eq(trader2BalanceAfter);
            expect(trader3BalanceBefore.add(trader3TradingFee)).to.be.eq(trader3BalanceAfter);
            expect(trader4BalanceBefore.add(trader4TradingFee)).to.be.eq(trader4BalanceAfter);
            expect(trader5BalanceBefore.add(trader5TradingFee)).to.be.eq(trader5BalanceAfter);
            expect(trader6BalanceBefore.add(trader6TradingFee)).to.be.eq(trader6BalanceAfter);

            // claim treasury fee
            const treasuryFee = await positionManager.treasuryFee();
            const poolAdminBalanceBefore = await usdt.balanceOf(poolAdmin.address);
            await roleManager.addPoolAdmin(poolAdmin.address);
            await positionManager.connect(poolAdmin.signer).claimTreauryFee();
            const poolAdminBalanceAfter = await usdt.balanceOf(poolAdmin.address);

            expect(poolAdminBalanceBefore.add(treasuryFee)).to.be.eq(poolAdminBalanceAfter);

            // claim staking trading fee
            await positionManager.setStakingPool(poolAdmin.address);
            const stakingTradingFee = await positionManager.stakingTradingFee();
            await positionManager.connect(poolAdmin.signer).claimStakingTradingFee();
            const poolAdminBalanceLatest = await usdt.balanceOf(poolAdmin.address);

            expect(poolAdminBalanceAfter.add(stakingTradingFee)).to.be.eq(poolAdminBalanceLatest);
        });
    });
});
