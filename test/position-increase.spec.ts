import { newTestEnv, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { MAX_UINT_AMOUNT, TradeType, waitForTx, ZERO_ADDRESS, convertIndexAmountToStable } from '../helpers';
import { extraHash, mintAndApprove, increasePosition, decreasePosition, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';
import { BigNumber } from 'ethers';
import { PRICE_PRECISION, PERCENTAGE } from './helpers/constants';

describe('Trade: increase position', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('collateral', () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                router,
                oraclePriceFeed,
            } = testEnv;

            // add liquidity
            const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
            const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
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
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );
        });

        it('user open position, collateral = 0', async () => {
            const {
                users: [trader],
                btc,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;

            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
            const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [
                    {
                        orderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const reason = await extraHash(tx.hash, 'ExecuteOrderError', 'errorMessage');

            expect(reason).to.be.eq('exceeds max leverage');

            // cancel order
            const orderAfter = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            expect(orderAfter.sizeAmount).to.be.eq('0');
        });

        it('user open position, use residual collateral', async () => {
            const {
                users: [trader],
                btc,
                usdt,
                router,
                orderManager,
                executor,
                keeper,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('700000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            // increase short position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            let orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest);

            // execution order
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [
                    {
                        orderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const positionBefore = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionBefore.positionAmount).to.be.eq(sizeAmount);

            // use residual collateral open position
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            const positionRequest2: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(positionRequest2);
            const orderAfter = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

            // execution order
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [
                    {
                        orderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const positionAfter = await positionManager.getPosition(trader.address, pairIndex, false);

            expect(positionAfter.positionAmount).to.be.eq(positionBefore.positionAmount.add(sizeAmount));
        });
    });
});
