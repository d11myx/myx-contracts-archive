import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove, decreasePosition, increasePosition, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/trading/Router';

describe('Trade: slippage', () => {
    const pairIndex = 0;
    let testEnv: TestEnv;

    describe('slippage tolerance', () => {
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
            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('transaction at market price, maxSlippage = 5%', async () => {
            const {
                users: [trader, trader2],
                keeper,
                usdt,
                router,
                positionManager,
                orderManager,
                executor,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const maxSlippage = 5000000;

            // buy low
            await updateBTCPrice(testEnv, '28500');
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            let position = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(position.positionAmount).to.be.eq(sizeAmount);

            await updateBTCPrice(testEnv, '28499');
            const increase2PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increase2PositionRequest);

            await expect(
                executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');

            // buy high
            await updateBTCPrice(testEnv, '31500');
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const increase3PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrderWithoutTpSl(increase3PositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            position = await positionManager.getPosition(trader2.address, pairIndex, true);

            expect(position.positionAmount).to.be.eq(sizeAmount);

            await updateBTCPrice(testEnv, '31501');
            const increase4PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrderWithoutTpSl(increase4PositionRequest);

            await expect(
                executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');
        });

        it('transaction at market price, maxSlippage = 0.01%', async () => {
            const {
                users: [trader, trader2],
                keeper,
                usdt,
                router,
                positionManager,
                orderManager,
                executor,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', 18);
            const sizeAmount = ethers.utils.parseUnits('10', 18);
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const maxSlippage = 10000;

            // buy low
            await updateBTCPrice(testEnv, '29997');
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            let position = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(position.positionAmount).to.be.eq('20000000000000000000');

            await updateBTCPrice(testEnv, '29996');
            const increase2PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increase2PositionRequest);

            await expect(
                executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');

            // buy high
            await updateBTCPrice(testEnv, '30003');
            await mintAndApprove(testEnv, usdt, collateral, trader2, router.address);
            const increase3PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrderWithoutTpSl(increase3PositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            position = await positionManager.getPosition(trader2.address, pairIndex, true);

            expect(position.positionAmount).to.be.eq('20000000000000000000');

            await updateBTCPrice(testEnv, '30004');
            const increase4PositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader2.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader2.signer).createIncreaseOrderWithoutTpSl(increase4PositionRequest);

            await expect(
                executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');
        });
    });

    describe('slippage fee', () => {
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
            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('liquidity is equal', async () => {
            const {
                users: [depositor, trader],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                executor,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const indexAmount = ethers.utils.parseUnits('10000', 18);
            const stableAmount = ethers.utils.parseUnits('300000000', 18);
            const price = ethers.utils.parseUnits('30000', 18);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);

            expect(vault.indexTotalAmount.mul(pairPrice)).to.be.eq(vault.stableTotalAmount);

            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);

            expect(expectAddLiquidity.mintAmount).to.be.eq(ethers.utils.parseUnits('599400000'));

            const totalFee = expectAddLiquidity.indexFeeAmount.mul(pairPrice).add(expectAddLiquidity.stableFeeAmount);
            const vaultTotal = vault.indexTotalAmount.mul(pairPrice).add(vault.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            console.log('userPaid: ', userPaid);

            expect(userPaid).to.be.eq(vaultTotal.add(totalFee));

            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, usdt, price, trader, router.address);
            await mintAndApprove(testEnv, btc, price, trader, router.address);
            const userBtcBalanceBefore = await btc.balanceOf(trader.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);
            console.log('userBtcBalanceBefore: ', userBtcBalanceBefore);
            console.log('userUsdtBalanceBefore: ', userUsdtBalanceBefore);

            const res = await router
                .connect(depositor.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            console.log('res: ', res);
        });
    });
});
