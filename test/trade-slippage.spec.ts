import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import {
    TradeType,
    getMockToken,
    convertStableAmountToIndex,
    convertIndexAmount,
    convertStableAmount,
} from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';
import usdt from '../markets/usdt';

describe('Trade: slippage', () => {
    const pairIndex = 1;

    describe('slippage tolerance', () => {
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
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('transaction at market price, maxSlippage = 5%', async () => {
            const {
                users: [trader, trader2],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
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
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
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
            await router.connect(trader.signer).createIncreaseOrder(increase2PositionRequest);

            await expect(
                executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
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
            await router.connect(trader2.signer).createIncreaseOrder(increase3PositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
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
            await router.connect(trader2.signer).createIncreaseOrder(increase4PositionRequest);

            await expect(
                executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');
        });

        it('transaction at market price, maxSlippage = 0.01%', async () => {
            const {
                users: [trader, trader2],
                keeper,
                usdt,
                btc,
                router,
                positionManager,
                orderManager,
                executionLogic,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);
            const maxSlippage = 10000;

            // buy low
            const traderPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
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
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            const traderPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(traderPositionAfter.positionAmount).to.be.eq(traderPositionBefore.positionAmount.add(sizeAmount));

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
            await router.connect(trader.signer).createIncreaseOrder(increase2PositionRequest);

            await expect(
                executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');

            // buy high
            const trader2PositionBefore = await positionManager.getPosition(trader2.address, pairIndex, true);
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
            await router.connect(trader2.signer).createIncreaseOrder(increase3PositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            const trader2PositionAfter = await positionManager.getPosition(trader2.address, pairIndex, true);

            expect(trader2PositionAfter.positionAmount).to.be.eq(trader2PositionBefore.positionAmount.add(sizeAmount));

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
            await router.connect(trader2.signer).createIncreaseOrder(increase4PositionRequest);

            await expect(
                executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
            ).to.be.revertedWith('exceeds max slippage');
        });
    });

    describe('slippage handling fee', () => {
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
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
        });

        it('btc = usdt, no slippage fees, only handling fees', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);

            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);
            const totoalApplyBefore = await lpToken.totalSupply();

            // expect(convertStableAmount.mul(pairPrice)).to.be.eq(vaultBefore.stableTotalAmount);
            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.eq(
                await convertStableAmountToIndex(btc, usdt, vaultBefore.stableTotalAmount),
            );
            expect(totoalApplyBefore).to.be.eq(expectAddLiquidity.mintAmount);

            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
            const userBtcBalanceBefore = await btc.balanceOf(trader.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

            expect(userLpBalanceBefore).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userBtcBalanceBefore).to.be.eq(indexAmount);
            expect(userUsdtBalanceBefore).to.be.eq(stableAmount);

            await router
                .connect(trader.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            const totoalApplyAfter = await lpToken.totalSupply();
            const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
            const userBtcBalanceAfter = await btc.balanceOf(trader.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userLpBalanceAfter.sub(userLpBalanceBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            const vaultAfter = await pool.getVault(pairIndex);
            const totalFee = expectAddLiquidity.indexFeeAmount.mul(pairPrice).add(expectAddLiquidity.stableFeeAmount);
            const vaultTotalAfter = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
            const vaultTotalBefore = vaultBefore.indexTotalAmount.mul(pairPrice).add(vaultBefore.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            const indexFeeAmount = indexAmount.mul(pair.addLpFeeP).div(1e8);
            const stableFeeAmount = stableAmount.mul(pair.addLpFeeP).div(1e8);
            const totalFeeAmount = indexFeeAmount.add(stableFeeAmount);

            expect(
                expectAddLiquidity.afterFeeIndexAmount.add(expectAddLiquidity.afterFeeStableAmount).add(totalFeeAmount),
            ).to.be.eq(indexAmount.add(stableAmount));
            expect(userPaid.add(vaultTotalBefore)).to.be.eq(vaultTotalAfter.add(totalFee));
        });

        it('btc > usdt and usdt != 0, there are slippage fees and handling fees', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);
            const totoalApplyBefore = await lpToken.totalSupply();

            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
            const userBtcBalanceBefore = await btc.balanceOf(trader.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.eq(
                await convertStableAmountToIndex(btc, usdt, vaultBefore.stableTotalAmount),
            );
            expect(userBtcBalanceBefore).to.be.eq(indexAmount);
            expect(userUsdtBalanceBefore).to.be.eq(stableAmount);

            await router
                .connect(trader.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);

            const totoalApplyAfter = await lpToken.totalSupply();
            const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
            const userBtcBalanceAfter = await btc.balanceOf(trader.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userLpBalanceAfter.sub(userLpBalanceBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            const vaultAfter = await pool.getVault(pairIndex);
            let totalFee = (await convertIndexAmount(btc, expectAddLiquidity.indexFeeAmount.mul(pairPrice), 18)).add(
                await convertStableAmount(usdt, expectAddLiquidity.stableFeeAmount, 18),
            );
            const vaultTotalAfter = (await convertIndexAmount(btc, vaultAfter.indexTotalAmount.mul(pairPrice), 18)).add(
                await convertStableAmount(usdt, vaultAfter.stableTotalAmount, 18),
            );
            const vaultTotalBefore = (
                await convertIndexAmount(btc, vaultBefore.indexTotalAmount.mul(pairPrice), 18)
            ).add(await convertStableAmount(usdt, vaultBefore.stableTotalAmount, 18));
            const userPaid = (await convertIndexAmount(btc, indexAmount.mul(pairPrice), 18)).add(
                await convertStableAmount(usdt, stableAmount, 18),
            );
            const indexFeeAmount = (await convertIndexAmount(btc, indexAmount.mul(pair.addLpFeeP), 18)).div(1e8);
            const stableFeeAmount = (await convertStableAmount(usdt, stableAmount.mul(pair.addLpFeeP), 18)).div(1e8);
            const totalFeeAmount = indexFeeAmount.add(stableFeeAmount);

            let slipAmount = BigNumber.from(0);
            if (expectAddLiquidity.slipToken == pair.indexToken) {
                slipAmount = await convertIndexAmount(btc, expectAddLiquidity.slipAmount, 18);
            } else if (expectAddLiquidity.slipToken == pair.stableToken) {
                slipAmount = await convertStableAmount(usdt, expectAddLiquidity.slipAmount, 18);
            }
            totalFee = totalFee.add(slipAmount);

            expect(
                (await convertIndexAmount(btc, expectAddLiquidity.afterFeeIndexAmount, 18))
                    .add(await convertStableAmount(usdt, expectAddLiquidity.afterFeeStableAmount, 18))
                    .add(totalFeeAmount),
            ).to.be.eq(
                (await convertIndexAmount(btc, indexAmount, 18))
                    .add(await convertStableAmount(usdt, stableAmount, 18))
                    .sub(slipAmount),
            );
        });

        it('btc > usdt and usdt == 0, there are slippage fees and handling fees', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, 0);
            const totoalApplyBefore = await lpToken.totalSupply();

            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
            const userBtcBalanceBefore = await btc.balanceOf(trader.address);

            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.gt(
                await convertStableAmountToIndex(btc, usdt, vaultBefore.stableTotalAmount),
            );
            expect(userBtcBalanceBefore).to.be.eq(indexAmount);

            await router.connect(trader.signer).addLiquidity(pair.indexToken, pair.stableToken, indexAmount, 0);
            const totoalApplyAfter = await lpToken.totalSupply();
            const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
            const userBtcBalanceAfter = await btc.balanceOf(trader.address);

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userLpBalanceAfter.sub(userLpBalanceBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));

            const vaultAfter = await pool.getVault(pairIndex);
            const totalFee = expectAddLiquidity.indexFeeAmount
                .mul(pairPrice)
                .add(expectAddLiquidity.slipAmount.mul(pairPrice));
            const vaultTotalAfter = vaultAfter.indexTotalAmount.mul(pairPrice);
            const vaultTotalBefore = vaultBefore.indexTotalAmount.mul(pairPrice);
            const userPaid = indexAmount.mul(pairPrice);
            const indexFeeAmount = indexAmount.mul(pair.addLpFeeP).div(1e8);

            expect(expectAddLiquidity.afterFeeIndexAmount.add(indexFeeAmount)).to.be.eq(
                indexAmount.sub(expectAddLiquidity.slipAmount),
            );
            expect(userPaid.add(vaultTotalBefore)).to.be.eq(vaultTotalAfter.add(totalFee));
        });

        it('usdt > btc and btc != 0, there are slippage fees and handling fees', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('90000000000', await usdt.decimals());

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            const vaultBefore = await pool.getVault(pairIndex);
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount);
            const totoalApplyBefore = await lpToken.totalSupply();

            await mintAndApprove(testEnv, btc, indexAmount, trader, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
            const userBtcBalanceBefore = await btc.balanceOf(trader.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.gt(
                await convertStableAmountToIndex(btc, usdt, vaultBefore.stableTotalAmount),
            );
            expect(userBtcBalanceBefore).to.be.eq(indexAmount);
            expect(userUsdtBalanceBefore).to.be.eq(stableAmount);

            await router
                .connect(trader.signer)
                .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
            const totoalApplyAfter = await lpToken.totalSupply();
            const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
            const userBtcBalanceAfter = await btc.balanceOf(trader.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userLpBalanceAfter.sub(userLpBalanceBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            const vaultAfter = await pool.getVault(pairIndex);
            const totalFee = expectAddLiquidity.indexFeeAmount
                .mul(pairPrice)
                .add(expectAddLiquidity.stableFeeAmount)
                .add(expectAddLiquidity.slipAmount);
            const vaultTotalAfter = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
            const vaultTotalBefore = vaultBefore.indexTotalAmount.mul(pairPrice).add(vaultBefore.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            const indexFeeAmount = indexAmount.mul(pair.addLpFeeP).div(1e8);
            const stableFeeAmount = stableAmount.mul(pair.addLpFeeP).div(1e8);
            const totalFeeAmount = indexFeeAmount.add(stableFeeAmount);

            expect(
                expectAddLiquidity.afterFeeIndexAmount.add(expectAddLiquidity.afterFeeStableAmount).add(totalFeeAmount),
            ).to.be.eq(indexAmount.add(stableAmount).sub(expectAddLiquidity.slipAmount));
            expect(userPaid.add(vaultTotalBefore)).to.be.eq(vaultTotalAfter.add(totalFee));
        });

        it('usdt > btc and btc == 0, there are slippage fees and handling fees', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
                oraclePriceFeed,
                pool,
            } = testEnv;

            const stableAmount = ethers.utils.parseUnits('30000000000', await usdt.decimals());

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            const expectAddLiquidity = await pool.getMintLpAmount(pairIndex, 0, stableAmount);
            const totoalApplyBefore = await lpToken.totalSupply();

            await mintAndApprove(testEnv, usdt, stableAmount, trader, router.address);
            const userLpBalanceBefore = await lpToken.balanceOf(trader.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(trader.address);

            expect(vaultBefore.indexTotalAmount.mul(pairPrice)).to.be.gt(vaultBefore.stableTotalAmount);
            expect(userUsdtBalanceBefore).to.be.eq(stableAmount);

            await router.connect(trader.signer).addLiquidity(pair.indexToken, pair.stableToken, 0, stableAmount);
            const totoalApplyAfter = await lpToken.totalSupply();
            const userLpBalanceAfter = await lpToken.balanceOf(trader.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(trader.address);

            expect(totoalApplyAfter.sub(totoalApplyBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userLpBalanceAfter.sub(userLpBalanceBefore)).to.be.eq(expectAddLiquidity.mintAmount);
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            const vaultAfter = await pool.getVault(pairIndex);
            const totalFee = expectAddLiquidity.stableFeeAmount.add(expectAddLiquidity.slipAmount);
            const stableFeeAmount = stableAmount.mul(pair.addLpFeeP).div(1e8);

            expect(expectAddLiquidity.afterFeeStableAmount.add(stableFeeAmount)).to.be.eq(
                stableAmount.sub(expectAddLiquidity.slipAmount),
            );
            expect(stableAmount.add(vaultBefore.stableTotalAmount)).to.be.eq(
                vaultAfter.stableTotalAmount.add(totalFee),
            );
        });
    });
});
