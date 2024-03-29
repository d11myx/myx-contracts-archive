import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove } from './helpers/misc';
import { BigNumber, constants } from 'ethers';
import { getMockToken, TradeType } from '../helpers';
import {
    convertIndexAmount,
    convertIndexAmountToStable,
    convertStableAmount,
    convertStableAmountToIndex,
} from '../helpers/token-decimals';

describe('LP: Pool cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
    });

    describe('liquidity of pool', () => {
        it('should increased correct liquidity', async () => {
            const {
                router,
                users: [depositor],
                usdt,
                btc,
                pool,
                poolView,
                oraclePriceFeed,
                positionManager,
            } = testEnv;

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );

            // add liquidity  增加流动性
            const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals()); //单价3w·
            const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals()); //单价1
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

            expect(await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address))).to.be.eq(
                ethers.utils.parseUnits('1000000000000'),
            );
            const vaultBefore = await pool.getVault(pairIndex);
            const userBtcBalanceBefore = await btc.balanceOf(depositor.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(depositor.address);
            expect(vaultBefore.indexTotalAmount).to.be.eq(0);
            expect(vaultBefore.stableTotalAmount).to.be.eq(0);

            const expectAddLiquidity = await poolView.getMintLpAmount(
                pairIndex,
                indexAmount,
                stableAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            expect(expectAddLiquidity.mintAmount).to.be.eq(ethers.utils.parseUnits('599400000'));
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
                            [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                        ),
                    ],
                    [0],
                    { value: 1 },
                );

            const lpToken = await getMockToken('', pair.pairToken);
            const totoalApply = await lpToken.totalSupply();
            expect(totoalApply).to.be.eq(ethers.utils.parseUnits('599400000'));
            const userLpBalanceBefore = await lpToken.balanceOf(depositor.address);
            expect(userLpBalanceBefore).to.be.eq(ethers.utils.parseUnits('599400000'));
            const vaultAfter = await pool.getVault(pairIndex);
            const userBtcBalanceAfter = await btc.balanceOf(depositor.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(depositor.address);

            expect(userBtcBalanceAfter).to.be.eq(userBtcBalanceBefore.sub(indexAmount));
            expect(userUsdtBalanceAfter).to.be.eq(userUsdtBalanceBefore.sub(stableAmount));

            // 50: 50
            expect(vaultAfter.indexTotalAmount.mul(pairPrice)).to.be.eq(
                await convertStableAmountToIndex(btc, usdt, vaultAfter.stableTotalAmount),
            );

            // userPaid = actual vaultTotal + totalFee
            const totalFee = expectAddLiquidity.indexFeeAmount.mul(pairPrice).add(expectAddLiquidity.stableFeeAmount);
            const vaultTotal = vaultAfter.indexTotalAmount.mul(pairPrice).add(vaultAfter.stableTotalAmount);
            const userPaid = indexAmount.mul(pairPrice).add(stableAmount);
            expect(userPaid).to.be.eq(vaultTotal.add(totalFee));

            // console.log('===================');
            // console.log(await positionManager.getNextFundingRate(pairIndex));
        });

        it('should decreased correct liquidity', async () => {
            const {
                router,
                users: [depositor],
                usdt,
                btc,
                pool,
                poolView,
                oraclePriceFeed,
            } = testEnv;
            const pair = await pool.getPair(pairIndex);

            const pairPrice = BigNumber.from(
                ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
            );
            // console.log('price:' + (await pool.getPrice(pair.indexToken)));
            // console.log(
            //     'lpFairPrice:' + (await pool.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address))),
            // );
            const lpPrice = BigNumber.from(
                ethers.utils
                    .formatUnits(await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address)), 30)
                    .replace('.0', ''),
            );

            const lpToken = await getMockToken('', pair.pairToken);

            const vaultBefore = await pool.getVault(pairIndex);
            const userBtcBalanceBefore = await btc.balanceOf(depositor.address);
            const userUsdtBalanceBefore = await usdt.balanceOf(depositor.address);
            const userLpBalanceBefore = await lpToken.balanceOf(depositor.address);

            // console.log('lp:' + userLpBalanceBefore);

            const lpAmount = ethers.utils.parseEther('30000');
            const expectRemoveLiquidity = await poolView.getReceivedAmount(
                pairIndex,
                lpAmount,
                await oraclePriceFeed.getPrice(btc.address),
            );
            await lpToken.connect(depositor.signer).approve(router.address, constants.MaxUint256);
            await router
                .connect(depositor.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                        ),
                    ],
                    [0],
                    { value: 1 },
                );

            const vaultAfter = await pool.getVault(pairIndex);
            const userBtcBalanceAfter = await btc.balanceOf(depositor.address);
            const userUsdtBalanceAfter = await usdt.balanceOf(depositor.address);
            const userLpBalanceAfter = await lpToken.balanceOf(depositor.address);

            expect(userLpBalanceAfter).to.be.eq(userLpBalanceBefore.sub(lpAmount));

            expect(userBtcBalanceAfter).to.be.eq(
                userBtcBalanceBefore.add(expectRemoveLiquidity.receiveIndexTokenAmount),
            );
            expect(userUsdtBalanceAfter).to.be.eq(
                userUsdtBalanceBefore.add(expectRemoveLiquidity.receiveStableTokenAmount),
            );

            // userPaid = actual vaultTotal
            const vaultTotal = (
                await convertIndexAmountToStable(
                    btc,
                    usdt,
                    expectRemoveLiquidity.receiveIndexTokenAmount
                        .add(expectRemoveLiquidity.feeIndexTokenAmount)
                        .mul(pairPrice),
                )
            )
                .add(expectRemoveLiquidity.receiveStableTokenAmount)
                .add(expectRemoveLiquidity.feeStableTokenAmount);
            const userPaid = lpAmount.mul(lpPrice);
            expect(userPaid).to.be.eq(await convertStableAmount(usdt, vaultTotal, 18));

            expect(
                (await convertIndexAmount(btc, vaultAfter.indexTotalAmount.mul(pairPrice), 18)).add(
                    await convertIndexAmount(usdt, vaultAfter.stableTotalAmount, 18),
                ),
            ).to.be.eq(
                (await convertIndexAmount(btc, vaultBefore.indexTotalAmount.mul(pairPrice), 18))
                    .add(await convertIndexAmount(usdt, vaultBefore.stableTotalAmount, 18))
                    .sub(lpAmount),
            );
        });
    });

    describe('long short tracker', () => {
        before(async () => {
            const {
                users: [depositor],
                btc,
                usdt,
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
        });

        describe('longTracker > shortTracker', () => {
            before(async () => {
                const {
                    users: [depositor],
                    usdt,
                    btc,
                    router,
                    positionManager,
                } = testEnv;

                // open position
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('100', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, depositor, router.address);
                await increasePosition(
                    testEnv,
                    depositor,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );

                const exposedPositions = await positionManager.getExposedPositions(pairIndex);
                expect(exposedPositions).to.be.gt(0);

                // console.log('===================');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user increase long, long tracker increased, index reserved added', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                expect(availableLongAfter).to.be.eq(availableLongBefore.sub(size.mul(pairPrice)));
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(lpFeeAmount));

                expect(vaultAfter.indexReservedAmount).to.be.eq(vaultBefore.indexReservedAmount.add(size));
            });

            it('user decrease long, long tracker decreased, index reserved subtracted', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    size,
                    TradeType.MARKET,
                    true,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                expect(availableLongAfter).to.be.eq(availableLongBefore.add(size.mul(pairPrice)));
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(lpFeeAmount));

                expect(vaultAfter.indexReservedAmount).to.be.eq(vaultBefore.indexReservedAmount.sub(size));

                // console.log('===================');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user increase short, long tracker decreased, index reserved subtracted', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                const delta = size.mul(pairPrice);
                expect(availableLongAfter).to.be.eq(availableLongBefore.add(delta));
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(lpFeeAmount));

                expect(vaultAfter.indexReservedAmount).to.be.eq(vaultBefore.indexReservedAmount.sub(size));

                // console.log('===================');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user decrease short, long tracker increased, index reserved added', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    size,
                    TradeType.MARKET,
                    false,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                const delta = size.mul(pairPrice);
                expect(availableLongAfter).to.be.eq(availableLongBefore.sub(delta));
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(lpFeeAmount));

                expect(vaultAfter.indexReservedAmount).to.be.eq(vaultBefore.indexReservedAmount.add(size));

                // console.log('===================');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });
        });

        describe('shortTracker > longTracker', () => {
            before(async () => {
                const {
                    users: [depositor],
                    usdt,
                    btc,
                    router,
                    positionManager,
                } = testEnv;

                // open position
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('200', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, depositor, router.address);
                await increasePosition(
                    testEnv,
                    depositor,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );

                const exposedPositions = await positionManager.getExposedPositions(pairIndex);
                expect(exposedPositions).to.be.lt(0);

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user increase long, short tracker decreased, stable reserved subtracted', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                expect(availableLongAfter).to.be.eq(availableLongBefore);

                const parsedStableAmount = await convertIndexAmountToStable(btc, usdt, size.mul(pairPrice));
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(parsedStableAmount).add(lpFeeAmount));

                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.sub(parsedStableAmount),
                );

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user decrease long, short tracker increased, stable reserved added', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    size,
                    TradeType.MARKET,
                    true,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                expect(availableLongAfter).to.be.eq(availableLongBefore);
                const parsedStableAmount = await convertIndexAmountToStable(btc, usdt, size.mul(pairPrice));
                expect(availableShortAfter).to.be.eq(availableShortBefore.sub(parsedStableAmount).add(lpFeeAmount));

                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.add(parsedStableAmount),
                );

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user increase short, short tracker increased, stable reserved added', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                const parsedStableAmount = await convertIndexAmountToStable(btc, usdt, size.mul(pairPrice));
                expect(availableLongAfter).to.be.eq(availableLongBefore);
                expect(availableShortAfter).to.be.eq(availableShortBefore.sub(parsedStableAmount).add(lpFeeAmount));

                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.add(parsedStableAmount),
                );

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('user decrease short, short tracker decreased, stable reserved subtracted', async () => {
                const {
                    users: [, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    size,
                    TradeType.MARKET,
                    false,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                const parsedStableAmount = await convertIndexAmountToStable(btc, usdt, size.mul(pairPrice));

                expect(availableLongAfter).to.be.eq(availableLongBefore);
                expect(availableShortAfter).to.be.eq(availableShortBefore.add(parsedStableAmount).add(lpFeeAmount));

                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.sub(parsedStableAmount),
                );

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });
        });

        describe('long tracker <=> short tracker', async () => {
            before(async () => {
                const {
                    users: [depositor],
                    usdt,
                    btc,
                    router,
                    positionManager,
                } = testEnv;

                // open position
                const collateral = ethers.utils.parseUnits('300000', await usdt.decimals());
                const size = ethers.utils.parseUnits('100', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, depositor, router.address);
                await increasePosition(
                    testEnv,
                    depositor,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );

                const exposedPositions = await positionManager.getExposedPositions(pairIndex);
                expect(exposedPositions).to.be.eq(0);
            });

            it('long tracker to short tracker, index reserved cleaned, stable reserved added', async () => {
                const {
                    users: [depositor, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;
                await mintAndApprove(testEnv, usdt, ethers.utils.parseUnits('30000', 18), depositor, router.address);
                await increasePosition(
                    testEnv,
                    depositor,
                    pairIndex,
                    ethers.utils.parseUnits('30000', await usdt.decimals()),
                    ethers.utils.parseUnits('30000', 30),
                    ethers.utils.parseUnits('10', await btc.decimals()),
                    TradeType.MARKET,
                    true,
                );

                // long tracker > short tracker
                expect(await positionManager.getExposedPositions(pairIndex)).to.be.gt(0);

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('20', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    false,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                // short tracker > long tracker
                expect(await positionManager.getExposedPositions(pairIndex)).to.be.lt(0);

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                const parsedStableAmount = await convertIndexAmountToStable(
                    btc,
                    usdt,
                    pairPrice.mul(ethers.utils.parseUnits('10', await btc.decimals())),
                );

                expect(availableShortAfter).to.be.eq(availableShortBefore.sub(parsedStableAmount).add(lpFeeAmount));

                expect(vaultAfter.indexTotalAmount).to.be.eq(vaultBefore.indexTotalAmount);
                expect(vaultAfter.indexReservedAmount).to.be.eq(
                    vaultBefore.indexReservedAmount.sub(vaultBefore.indexReservedAmount),
                );
                expect(vaultAfter.indexReservedAmount).to.be.eq(0);

                expect(vaultAfter.stableTotalAmount).to.be.eq(vaultBefore.stableTotalAmount.add(lpFeeAmount));
                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.add(parsedStableAmount),
                );

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });

            it('short tracker to long tracker, index reserved added, stable reserved cleaned', async () => {
                const {
                    users: [depositor, trader],
                    btc,
                    usdt,
                    router,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                // short tracker > long tracker
                expect(await positionManager.getExposedPositions(pairIndex)).to.be.lt(0);

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const vaultBefore = await pool.getVault(pairIndex);
                const availableLongBefore = vaultBefore.indexTotalAmount
                    .sub(vaultBefore.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortBefore = vaultBefore.stableTotalAmount.sub(vaultBefore.stableReservedAmount);

                // open position
                const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
                const size = ethers.utils.parseUnits('20', await btc.decimals());
                const openPrice = ethers.utils.parseUnits('30000', 30);
                await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
                const { executeReceipt } = await increasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    collateral,
                    openPrice,
                    size,
                    TradeType.MARKET,
                    true,
                );
                const lpFeeAmount = await extraHash(
                    executeReceipt?.transactionHash,
                    'DistributeTradingFee',
                    'lpAmount',
                );

                // long tracker > short tracker
                expect(await positionManager.getExposedPositions(pairIndex)).to.be.gt(0);

                const vaultAfter = await pool.getVault(pairIndex);
                const availableLongAfter = vaultAfter.indexTotalAmount
                    .sub(vaultAfter.indexReservedAmount)
                    .mul(pairPrice);
                const availableShortAfter = vaultAfter.stableTotalAmount.sub(vaultAfter.stableReservedAmount);

                expect(availableLongAfter).to.be.eq(
                    availableLongBefore.sub(pairPrice.mul(ethers.utils.parseUnits('10', await btc.decimals()))),
                );

                expect(vaultAfter.indexTotalAmount).to.be.eq(vaultBefore.indexTotalAmount);
                expect(vaultAfter.indexReservedAmount).to.be.eq(
                    vaultBefore.indexReservedAmount.add(ethers.utils.parseUnits('10', await btc.decimals())),
                );

                expect(vaultAfter.stableTotalAmount).to.be.eq(vaultBefore.stableTotalAmount.add(lpFeeAmount));
                expect(vaultAfter.stableReservedAmount).to.be.eq(
                    vaultBefore.stableReservedAmount.sub(vaultBefore.stableReservedAmount),
                );
                expect(vaultAfter.stableReservedAmount).to.be.eq(0);

                // console.log('===================1111');
                // console.log(await positionManager.getNextFundingRate(pairIndex));
            });
        });
    });
});
