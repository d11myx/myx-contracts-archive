import { ethers } from 'hardhat';
import { newTestEnv, TestEnv } from './helpers/make-suite';
import { before } from 'mocha';
import { increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { getBlockTimestamp, TradeType, waitForTx, ZERO_ADDRESS } from '../helpers';
import { PoolToken } from '../types';
import { expect } from './shared/expect';
import { getContract } from '../helpers/utilities/tx';
import { TradingTypes } from '../types/contracts/core/Router';
import Decimal from 'decimal.js';
import { NETWORK_FEE_AMOUNT, PAYMENT_TYPE } from './helpers/constants';

describe('Modify LP Average Price', async () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            btc,
            usdt,
            pool,
            router,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());

        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
        let pair = await pool.getPair(pairIndex);

        let lpToken = (await getContract<PoolToken>('PoolToken', pair[3])) as PoolToken;
        let bal = await lpToken.balanceOf(depositor.address);
        expect(bal).to.be.eq('0');
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                [0],
                { value: 1 },
            );
        bal = await lpToken.balanceOf(depositor.address);
        expect(bal).to.be.eq('899100000000000000000000000');
        let blaPool = await lpToken.balanceOf(pool.address);
        // expect(blaPool).to.be.eq('1');
    });

    after(async () => {});

    describe('Platform is long position', async () => {
        before('increase long position: +20 BTC, openPrice: 30000', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                router,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                sizeAmount,
                TradeType.MARKET,
                true,
            );
        });

        after(async () => {
            await updateBTCPrice(testEnv, '30000');
        });

        it('BTO: increase long position: +10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
                orderManager,
                usdt,
                btc,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '32000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('32000', 30);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: true,
                sizeAmount: sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: true,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            expect(positionAft.averagePrice).to.be.eq(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('BTO: increase long position: +10 BTC, openPrice: 29000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
                orderManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '29000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('100000', await usdt.decimals());
            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

            const sizeAmount = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('29000', 30);

            const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: true,
                sizeAmount: sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: true,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);
            const uintNum = ethers.utils.parseUnits('1', 30);
            //todo
            // expect(new Decimal(positionAft.averagePrice.toString()).div(uintNum.toString()).toFixed(6)).to.be.eq(
            //     new Decimal(positionBefAvgPrice.toString())
            //         .mul(positionBefAmount.toString())
            //         .add(openPrice.mul(sizeAmount).toString())
            //         .div(positionBefAmount.add(sizeAmount).toString())
            //         .div(uintNum.toString())
            //         .toFixed(6),
            // );
        });

        it('STC: decrease long position: -10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                router,
                btc,
                usdt,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                positionManager,
                orderManager,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('40000', 30);

            const decreasePositionRequst: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                isLong: true,
                triggerPrice: openPrice,
                sizeAmount: sizeAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequst);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolLosses = sizeAmount
                .mul(positionBef.averagePrice.sub(openPrice))
                .div(ethers.utils.parseUnits('1', 30))
                .abs();
            expect(positionBef.averagePrice).to.be.lt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(sizeAmount))
                    .div(positionBefAmount.add(sizeAmount)),
            );
        });

        it('STC: decrease long position: -10 BTC, openPrice: 29000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                btc,
                usdt,
                router,
                executor,
                positionManager,
                orderManager,
                oraclePriceFeed,
                indexPriceFeed,
                pool,
            } = testEnv;

            // update btc price
            await updateBTCPrice(testEnv, '29000');

            const positionBef = await positionManager.getPosition(trader.address, pairIndex, true);
            const positionBefAvgPrice = positionBef.averagePrice;
            const positionBefAmount = positionBef.positionAmount;

            // increase position
            const collateral = ethers.utils.parseUnits('0', await usdt.decimals());
            const descreaseAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('29000', 30);

            const decreasePositionRequst: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                isLong: true,
                triggerPrice: openPrice,
                sizeAmount: descreaseAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequst);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolProfit = descreaseAmount
                .mul(positionBef.averagePrice.sub(openPrice))
                .div(ethers.utils.parseUnits('1', 30));
            expect(positionBef.averagePrice).to.be.gt(
                positionBefAvgPrice
                    .mul(positionBefAmount)
                    .add(openPrice.mul(descreaseAmount))
                    .div(positionBefAmount.add(descreaseAmount)),
            );
        });
    });

    describe('Platform is short position', async () => {
        before('increase short position: +10 BTC, openPrice: 30000', async () => {
            const {
                deployer,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                orderManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('20000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                collateral,
                openPrice,
                sizeAmount,
                TradeType.MARKET,
                false,
            );
        });

        after(async () => {
            await updateBTCPrice(testEnv, '60000');
        });

        it('STO: increase short position: +10 BTC, openPrice: 20000, newAveragePrice < openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '20000');

            const collateral = ethers.utils.parseUnits('200000', await usdt.decimals());
            const shortAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('20000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

            const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: false,
                sizeAmount: shortAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: true,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(positionAft.averagePrice).to.be.eq(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(shortAmount))
                    .div(position.positionAmount.add(shortAmount)),
            );
        });

        it('STO: increase short position: +10 BTC, openPrice: 40000, newAveragePrice > openPositionAveragePrice', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '40000');

            const collateral = ethers.utils.parseUnits('200000', await usdt.decimals());
            const shortAmount = ethers.utils.parseUnits('10', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('40000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

            const incresePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: openPrice,
                isLong: false,
                sizeAmount: shortAmount,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createIncreaseOrder(incresePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteIncreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: true,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);
            // expect(positionAft.averagePrice).to.be.eq(
            //     position.averagePrice
            //         .mul(position.positionAmount)
            //         .add(openPrice.mul(shortAmount))
            //         .div(position.positionAmount.add(shortAmount)),
            // );
        });

        it('BTC: decrease short position: -20 BTC, openPrice: 45000, newAveragePrice > openPositionAveragePrice, userBalance -> lpBalance', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '35000');

            const collateral = ethers.utils.parseUnits('200000', await usdt.decimals());
            const decreaseAmount = ethers.utils.parseUnits('20', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('35000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                sizeAmount: decreaseAmount,
                isLong: false,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);

            const poolProfit = decreaseAmount
                .mul(openPrice.sub(position.averagePrice))
                .div(ethers.utils.parseUnits('1', 30));

            expect(positionAft.averagePrice).to.be.lt(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(decreaseAmount))
                    .div(position.positionAmount.add(decreaseAmount)),
            );
        });

        it('BTC: decrease short position: -5  BTC, openPrice: 10000, newAveragePrice < openPositionAveragePrice, lpBalance -> userBalance', async () => {
            const {
                keeper,
                users: [trader],
                usdt,
                btc,
                router,
                executor,
                indexPriceFeed,
                oraclePriceFeed,
                orderManager,
                positionManager,
            } = testEnv;

            const position = await positionManager.getPosition(trader.address, pairIndex, false);

            // update btc price
            await updateBTCPrice(testEnv, '10000');

            const collateral = ethers.utils.parseUnits('200000', await usdt.decimals());
            const decreaseAmount = ethers.utils.parseUnits('5', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('10000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);

            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: trader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                sizeAmount: decreaseAmount,
                isLong: false,
                maxSlippage: 0,
                paymentType: PAYMENT_TYPE,
                networkFeeAmount: NETWORK_FEE_AMOUNT,
            };

            const orderId = await orderManager.ordersIndex();
            await router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
                [btc.address],
                [await indexPriceFeed.getPrice(btc.address)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                [
                    {
                        orderId: orderId,
                        tradeType: TradeType.MARKET,
                        isIncrease: false,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );

            const positionAft = await positionManager.getPosition(trader.address, pairIndex, false);

            const poolLosses = decreaseAmount
                .mul(openPrice.sub(position.averagePrice))
                .div(ethers.utils.parseUnits('1', 30))
                .abs();

            expect(positionAft.averagePrice).to.be.gt(
                position.averagePrice
                    .mul(position.positionAmount)
                    .add(openPrice.mul(decreaseAmount))
                    .div(position.positionAmount.add(decreaseAmount)),
            );
        });
    });
});
