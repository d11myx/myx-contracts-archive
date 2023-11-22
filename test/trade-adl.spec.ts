import { newTestEnv, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, getMockToken, convertIndexAmountToStable, ZERO_ADDRESS } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Trade: adl', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    describe('exposure long, B > LP USDT total / price + A', () => {
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

        it('should decrease long position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                oraclePriceFeed,
                indexPriceFeed,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            /* long decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                        orderId: decreaseOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short, B > LP USDT total / price + A', () => {
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

        it('should decrease long position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                indexPriceFeed,
                oraclePriceFeed,
                btc,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            /* long decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: true,
                sizeAmount: longPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                        orderId: decreaseOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(decreasePosition.positionAmount).to.be.eq(longPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long, B > LP BTC total - A', () => {
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

        it('should decrease short position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('600', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('30000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            /* short decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: false,
                sizeAmount: shortPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                        orderId: decreaseOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(decreasePosition.positionAmount).to.be.eq(shortPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short, B > LP BTC total - A', () => {
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

        it('should decrease short position trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executor,
                usdt,
                pool,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            /* short decrease position will wait for adl */
            const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: 0,
                triggerPrice: openPrice,
                isLong: false,
                sizeAmount: shortPosition.positionAmount,
                maxSlippage: 0,
            };
            const decreaseOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createDecreaseOrder(decreasePositionRequest);
            await executor.connect(keeper.signer).setPricesAndExecuteDecreaseMarketOrders(
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
                        orderId: decreaseOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const decreaseOrder = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);
            const decreasePosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(decreasePosition.positionAmount).to.be.eq(shortPosition.positionAmount);
            expect(decreaseOrder.needADL).to.be.eq(true);

            // execute ADL
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrder.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(decreaseOrderId, TradeType.MARKET);

            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long user increase long position, B > LP USDT total / price + A', () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                oraclePriceFeed,
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

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
                executor,
                indexPriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);
            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure long
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '26400');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(oraclePrice.sub(longPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = longPosition.collateral.add(pnl).sub(tradingFee);
            const margin = longPosition.positionAmount
                .mul(longPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // execute ADL
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );
            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
            );
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            expect(longBalanceAfter).to.be.eq(receiveStableTokenAmount);
            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short user increase long position, B > LP USDT total / price + A', () => {
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

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                oraclePriceFeed,
                btc,
                executor,
                indexPriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('800', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('200', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.stableTotalAmount.div(pairPrice).add(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.gt(0);
            // decrease position amount > available
            expect(longPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '26400');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, longPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(oraclePrice.sub(longPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = longPosition.collateral.add(pnl).sub(tradingFee);
            const margin = longPosition.positionAmount
                .mul(longPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: 0,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // execute ADL
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(longTrader.address, pairIndex, true);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            expect(longBalanceAfter).to.be.eq(receiveStableTokenAmount);
            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure long user increase short position, B > BTC total - A', () => {
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

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                executor,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '33600');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(-1)
                .mul(oraclePrice.sub(shortPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = shortPosition.collateral.add(pnl).sub(tradingFee);
            const margin = shortPosition.positionAmount
                .mul(shortPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: 0,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // execute ADL
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            expect(longBalanceAfter).to.be.eq(receiveStableTokenAmount);
            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('exposure short user increase short position, B > BTC total - A', () => {
        before('add liquidity', async () => {
            testEnv = await newTestEnv();
            const {
                users: [depositor],
                usdt,
                btc,
                pool,
                oraclePriceFeed,
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

        it('should liquidate positions trigger adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                executor,
                btc,
                indexPriceFeed,
                oraclePriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '33600');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(-1)
                .mul(oraclePrice.sub(shortPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(oraclePrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = shortPosition.collateral.add(pnl).sub(tradingFee);
            const margin = shortPosition.positionAmount
                .mul(shortPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: 0,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // execute ADL
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            expect(longBalanceAfter).to.be.eq(receiveStableTokenAmount);
            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });

    describe('oracle price > keeper price 0.5%, exceed max price deviation', () => {
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

        it('should cancel adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                executor,
                btc,
                oraclePriceFeed,
                indexPriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '33600');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const poolPrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(-1)
                .mul(poolPrice.sub(shortPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(poolPrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = shortPosition.collateral.add(pnl).sub(tradingFee);
            const margin = shortPosition.positionAmount
                .mul(shortPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: 0,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // update oracle price
            const latestOraclePrice = ethers.utils.parseUnits('32180', 8);
            const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
            const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
            const fee = mockPyth.getUpdateFee(updateData);
            await oraclePriceFeed
                .connect(keeper.signer)
                .updatePrice([btc.address], [new ethers.utils.AbiCoder().encode(['uint256'], [latestOraclePrice])], {
                    value: fee,
                });
            const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
            const indexPrice = await indexPriceFeed.getPrice(btc.address);

            // oraclePrice > indexPrice 0.5%
            expect(oraclePrice.sub(indexPrice).abs().mul('100000000').div(oraclePrice)).to.be.gte(
                tradingConfig.maxPriceDeviationP,
            );

            await expect(
                executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                            positionKey,
                            sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                            tier: 0,
                            referralsRatio: 0,
                            referralUserRatio: 0,
                            referralOwner: ZERO_ADDRESS,
                        },
                    ],
                    decreaseOrderAdlBefore.orderId,
                    TradeType.MARKET,
                    0,
                    0,
                    0,
                    ZERO_ADDRESS,
                    { value: 1 },
                ),
            ).to.be.revertedWith('exceed max price deviation');
        });
    });

    describe('oracle price < keeper price 0.5%', () => {
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

        it('should adl', async () => {
            const {
                users: [longTrader, shortTrader],
                router,
                positionManager,
                orderManager,
                keeper,
                executionLogic,
                usdt,
                pool,
                executor,
                btc,
                oraclePriceFeed,
                indexPriceFeed,
                feeCollector,
            } = testEnv;
            const collateral = ethers.utils.parseUnits('3000000', await usdt.decimals());
            const sizeAmount = ethers.utils.parseUnits('200', await btc.decimals());
            const sizeAmount2 = ethers.utils.parseUnits('800', await btc.decimals());
            const openPrice = ethers.utils.parseUnits('30000', 30);

            const exposureAmountBefore = await positionManager.getExposedPositions(pairIndex);
            expect(exposureAmountBefore).to.be.eq(0);

            /* increase long position */
            await mintAndApprove(testEnv, usdt, collateral, longTrader, router.address);
            const longPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: longTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: true,
                sizeAmount,
                maxSlippage: 0,
            };
            const longOrderId = await orderManager.ordersIndex();
            await router.connect(longTrader.signer).createIncreaseOrder(longPositionRequest);
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
                        orderId: longOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const longPosition = await positionManager.getPosition(longTrader.address, pairIndex, true);

            expect(longPosition.positionAmount).to.be.eq(sizeAmount);

            /* increase short position */
            await mintAndApprove(testEnv, usdt, collateral, shortTrader, router.address);
            const shortPositionRequest: TradingTypes.IncreasePositionRequestStruct = {
                account: shortTrader.address,
                pairIndex,
                tradeType: TradeType.MARKET,
                collateral,
                openPrice,
                isLong: false,
                sizeAmount: sizeAmount2,
                maxSlippage: 0,
            };
            const shortOrderId = await orderManager.ordersIndex();
            await router.connect(shortTrader.signer).createIncreaseOrder(shortPositionRequest);
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
                        orderId: shortOrderId,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const shortPosition = await positionManager.getPosition(shortTrader.address, pairIndex, false);

            expect(shortPosition.positionAmount).to.be.eq(sizeAmount2);

            // remove liquidity
            const lpAmount = ethers.utils.parseEther('40000000');
            const { receiveStableTokenAmount } = await pool.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            const pair = await pool.getPair(pairIndex);
            const lpToken = await getMockToken('', pair.pairToken);
            await lpToken.connect(longTrader.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(longTrader.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                        ),
                    ],
                    { value: 1 },
                );

            const vault = await pool.getVault(pairIndex);
            const exposureAmountAfter = await positionManager.getExposedPositions(pairIndex);
            const available = vault.indexTotalAmount.sub(exposureAmountAfter);

            // exposure short
            expect(exposureAmountAfter).to.be.lt(0);
            // decrease position amount > available
            expect(shortPosition.positionAmount).to.be.gt(available);

            // update price
            await updateBTCPrice(testEnv, '33600');

            // calculate pnl、tradingFee
            const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
            const tradingConfig = await pool.getTradingConfig(pairIndex);
            const poolPrice = await oraclePriceFeed.getPrice(pair.indexToken);
            const indexToStableAmount = await convertIndexAmountToStable(btc, usdt, shortPosition.positionAmount);
            const pnl = indexToStableAmount
                .mul(-1)
                .mul(poolPrice.sub(shortPosition.averagePrice))
                .div('1000000000000000000000000000000');
            const sizeDelta = indexToStableAmount.mul(poolPrice).div('1000000000000000000000000000000');
            const tradingFee = sizeDelta.mul(tradingFeeConfig.takerFee).div('100000000');

            // calculate riskRate
            const exposureAsset = shortPosition.collateral.add(pnl).sub(tradingFee);
            const margin = shortPosition.positionAmount
                .mul(shortPosition.averagePrice)
                .div('1000000000000000000000000000000')
                .mul(tradingConfig.maintainMarginRate)
                .div('100000000');
            const riskRate = (await convertIndexAmountToStable(btc, usdt, margin)).mul('100000000').div(exposureAsset);

            // riskRate >= 100%
            expect(riskRate).to.be.gte('100000000');

            // liquidate positions will wait for adl
            const positionKey = await positionManager.getPositionKey(shortTrader.address, pairIndex, false);
            await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
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
                        positionKey: positionKey,
                        sizeAmount: 0,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                { value: 1 },
            );
            const orders = await orderManager.getPositionOrders(positionKey);
            const decreaseOrderAdlBefore = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);

            expect(decreaseOrderAdlBefore.needADL).to.be.eq(true);

            // update oracle price
            const latestOraclePrice = ethers.utils.parseUnits('33680', 8);
            const updateData = await oraclePriceFeed.getUpdateData([btc.address], [latestOraclePrice]);
            const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
            const fee = mockPyth.getUpdateFee(updateData);
            await oraclePriceFeed
                .connect(keeper.signer)
                .updatePrice([btc.address], [new ethers.utils.AbiCoder().encode(['uint256'], [latestOraclePrice])], {
                    value: fee,
                });
            const oraclePrice = await oraclePriceFeed.getPrice(btc.address);
            const indexPrice = await indexPriceFeed.getPrice(btc.address);

            // oraclePrice < indexPrice 0.5%
            expect(indexPrice.sub(oraclePrice).abs().mul('100000000').div(oraclePrice)).to.be.lt(
                tradingConfig.maxPriceDeviationP,
            );

            // execute ADL
            await executor.connect(keeper.signer).setPricesAndExecuteADL(
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
                        positionKey,
                        sizeAmount: decreaseOrderAdlBefore.sizeAmount,
                        tier: 0,
                        referralsRatio: 0,
                        referralUserRatio: 0,
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
                decreaseOrderAdlBefore.orderId,
                TradeType.MARKET,
                0,
                0,
                0,
                ZERO_ADDRESS,
                { value: 1 },
            );

            const decreasePositionAdlAfter = await positionManager.getPosition(shortTrader.address, pairIndex, false);
            const decreaseOrderAdlAfter = await orderManager.getDecreaseOrder(orders[0].orderId, TradeType.MARKET);
            const longBalanceAfter = await usdt.balanceOf(longTrader.address);

            expect(longBalanceAfter).to.be.eq(receiveStableTokenAmount);
            expect(decreasePositionAdlAfter.positionAmount).to.be.eq(
                decreaseOrderAdlAfter.sizeAmount.sub(decreaseOrderAdlAfter.executedSize),
            );
        });
    });
});
