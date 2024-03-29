import { TestEnv } from '../../test/helpers/make-suite';
import { BigNumber, ethers } from 'ethers';
import { MockERC20Token } from '../../types';
import { convertIndexAmountToStable } from '../token-decimals';

const PRICE_PRECISION = '1000000000000000000000000000000';
const PERCENTAGE = '100000000';

/**
 * calculation epoch funding rate
 *
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @returns funding rate
 */
export async function getFundingRateInTs(testEnv: TestEnv, pairIndex: number) {
    const { positionManager, pool, fundingRate, oraclePriceFeed, btc, usdt } = testEnv;
    const { indexTotalAmount, indexReservedAmount, stableTotalAmount, stableReservedAmount } =
        await pool.getVault(pairIndex);

    const pair = await pool.getPair(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);
    const fundingFeeConfig = await fundingRate.fundingFeeConfigs(pairIndex);

    const indexReservedToStable = (await convertIndexAmountToStable(btc, usdt, indexReservedAmount))
        .mul(price)
        .div('1000000000000000000000000000000');
    const u = stableTotalAmount.sub(stableReservedAmount).add(indexReservedToStable);
    const v = (await convertIndexAmountToStable(btc, usdt, indexTotalAmount.sub(indexReservedAmount)))
        .mul(price)
        .div('1000000000000000000000000000000')
        .add(stableReservedAmount);

    const k = fundingFeeConfig.growthRate;
    const r = fundingFeeConfig.baseRate;
    const maxRate = fundingFeeConfig.maxRate;
    const fundingInterval = fundingFeeConfig.fundingInterval;
    if (u.eq(v)) {
        return r.div(86400 / fundingInterval.toNumber());
    }
    // S = ABS(2*R-1)=ABS(U-V)/(U+V)
    let s = u.sub(v).mul(PERCENTAGE).div(u.add(v));

    // G1 = MIN((S+S*S/2) * k + r, r(max))
    const min = s.mul(s).div(2).div(PERCENTAGE).add(s).mul(k).div(PERCENTAGE).add(r);
    const g1 = min.lt(maxRate) ? min : maxRate;

    // G1+ABS(G1*A/10) * (u-v)/abs(u-v)
    return g1.div(86400 / fundingInterval.toNumber());
}

/**
 * calculation position average price
 *
 * @description averagePrice = (previousPositionAveragePrice * previousPositionAmount) + (openPrice * positionAmount) / (previousPositionAmount + positionAmount)
 * @param previousPositionAveragePrice {BigNumber} previous position average price
 * @param previousPositionAmount{BigNumber} previous position size
 * @param openPrice {BigNumber} current open position price
 * @param positionAmount {BigNumber} current position size
 * @returns position average price
 */
export function getAveragePrice(
    previousPositionAveragePrice: BigNumber,
    previousPositionAmount: BigNumber,
    openPrice: BigNumber,
    positionAmount: BigNumber,
) {
    return previousPositionAveragePrice
        .mul(previousPositionAmount)
        .div(PRICE_PRECISION)
        .add(openPrice.mul(positionAmount).div(PRICE_PRECISION))
        .mul(PRICE_PRECISION)
        .div(previousPositionAmount.add(positionAmount));
}

/**
 * calculation epoch funding fee tracker
 *
 * @description fundingFeeTracker = previousFundingFeeTracker * currentEpochFundingFee
 * @param previousFundingFeeTracker {BigNumber} previous epoch funding fee tracker
 * @param fundingRate {BigNumber} current epoch funding rate
 * @param openPrice {BigNumber} current epoch open price
 * @returns epoch funding fee tracker
 */
export function getFundingFeeTracker(
    previousFundingFeeTracker: BigNumber,
    fundingRate: BigNumber,
    openPrice: BigNumber,
) {
    return previousFundingFeeTracker.add(getEpochFundingFee(fundingRate, openPrice));
}

/**
 * calculation epoch currency standard funding fee
 *
 * @description currentEpochFundingFee = currentEpochRate * currentOpenPrice
 * @param fundingRate {BigNumber} current epoch funding rate
 * @param openPrice {BigNumber} current opsition open price
 * @returns each position holding one currency that passes the checkpoint requires a corresponding USDT fee to be paid
 */
export function getEpochFundingFee(fundingRate: BigNumber, openPrice: BigNumber) {
    return fundingRate.mul(openPrice).div(PRICE_PRECISION);
}

/**
 * calculation current position funding fee
 *
 * @param globalFundingFeeTracker {BigNumber} global funding fee tracker
 * @param positionFundingFeeTracker {BigNumber} position funding fee tracker
 * @param positionAmount {BigNumber} current position size
 * @param isLong {Boolean} long or short
 * @returns current position funding fee
 */
export async function getPositionFundingFee(
    testEnv: TestEnv,
    pairIndex: number,
    indexToken: MockERC20Token,
    stableToken: MockERC20Token,
    globalFundingFeeTracker: BigNumber,
    positionFundingFeeTracker: BigNumber,
    positionAmount: BigNumber,
    isLong: boolean,
) {
    let fundingFee;
    const diffFundingFeeTracker = globalFundingFeeTracker.sub(positionFundingFeeTracker);
    if ((isLong && diffFundingFeeTracker.gt(0)) || (!isLong && diffFundingFeeTracker.lt(0))) {
        fundingFee = -1;
    } else {
        fundingFee = 1;
    }
    let positionStableAmount = await convertIndexAmountToStable(indexToken, stableToken, positionAmount);

    return positionStableAmount.mul(diffFundingFeeTracker.abs()).div(PERCENTAGE).mul(fundingFee);
}

/**
 * calculation lp funding fee
 *
 * @param epochFundindFee {BigNumber} epoch currency standard funding fee
 * @param lpPosition {BigNumber} current position size
 * @returns current lp funding fee
 */
export function getLpFundingFee(epochFundindFee: BigNumber, lpPosition: BigNumber) {
    return lpPosition.mul(epochFundindFee).div(PERCENTAGE).abs();
}

/**
 * calculation position trading fee
 *
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @param positionAmount {BigNumber} current position size
 * @param isLong {Boolean} long or short
 * @returns current position trading fee
 */
export async function getPositionTradingFee(
    testEnv: TestEnv,
    pairIndex: number,
    indexToken: MockERC20Token,
    stableToken: MockERC20Token,
    positionAmount: BigNumber,
    isLong: boolean,
) {
    const { positionManager, pool, oraclePriceFeed, feeCollector } = testEnv;

    const pair = await pool.getPair(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);
    const currentExposureAmountChecker = await positionManager.getExposedPositions(pairIndex);
    const tradingFeeConfig = await feeCollector.getRegularTradingFeeTier(pairIndex);
    const positionStableAmount = await convertIndexAmountToStable(
        indexToken,
        stableToken,
        positionAmount.mul(price).div(PRICE_PRECISION),
    );
    let tradingFee;

    if (currentExposureAmountChecker.gte(0)) {
        tradingFee = isLong
            ? positionStableAmount.mul(tradingFeeConfig.takerFee).div(PERCENTAGE)
            : positionStableAmount.mul(tradingFeeConfig.makerFee).div(PERCENTAGE);
    } else {
        tradingFee = isLong
            ? positionStableAmount.mul(tradingFeeConfig.makerFee).div(PERCENTAGE)
            : positionStableAmount.mul(tradingFeeConfig.takerFee).div(PERCENTAGE);
    }

    return tradingFee;
}

/**
 * calculation distribute trading fee
 *
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @param tradingFee {BigNumber} current position trading fee
 * @param vipLevel {number} vip level, the default value is 0
 * @param referenceRate {number} reference rate, the default value is 0
 * @returns distribute trading fee
 */
export async function getDistributeTradingFee(
    testEnv: TestEnv,
    pairIndex: number,
    tradingFee: BigNumber,
    vipLevel = 0,
    referenceRate = 0,
) {
    const { pool, feeCollector } = testEnv;

    const tierFee = await feeCollector.getTradingFeeTier(pairIndex, vipLevel);
    const regularFee = await feeCollector.getRegularTradingFeeTier(pairIndex);
    const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
    const delta = tradingFee.mul(PERCENTAGE).div(regularFee.takerFee);
    const vipAmount = tradingFee.sub(delta.mul(tierFee.takerFee).div(PERCENTAGE));
    const userTradingFee = vipAmount;
    const surplusFee = tradingFee.sub(vipAmount);
    if (referenceRate > Number(PERCENTAGE)) {
        referenceRate = Number(PERCENTAGE);
    }
    const referralsAmount = surplusFee.mul(referenceRate).div(PERCENTAGE);
    const lpAmount = surplusFee.mul(tradingFeeConfig.lpFeeDistributeP).div(PERCENTAGE);
    const keeperAmount = surplusFee.mul(tradingFeeConfig.keeperFeeDistributeP).div(PERCENTAGE);
    const stakingAmount = surplusFee.mul(tradingFeeConfig.stakingFeeDistributeP).div(PERCENTAGE);
    const distributorAmount = surplusFee.sub(referralsAmount).sub(lpAmount).sub(keeperAmount).sub(stakingAmount);
    const treasuryFee = distributorAmount.add(referralsAmount);

    return { userTradingFee, treasuryFee, stakingAmount, keeperAmount };
}

/**
 * calculation mint lp amount
 *
 * @description ((totalDelta - slipDelta) * pricePrecision) / pairPrice
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @param indexAmount {BigNumber} btc amount
 * @param stableAmount {BigNumber} usdt amount
 * @param slipDelta {BigNumber} slipDate
 * @returns lp amount
 */
export async function getMintLpAmount(
    testEnv: TestEnv,
    pairIndex: number,
    indexAmount: BigNumber,
    stableAmount: BigNumber,
    slipDelta?: BigNumber,
) {
    const { pool, poolView, oraclePriceFeed, btc } = testEnv;

    const pair = await pool.getPair(pairIndex);
    const pairPrice = BigNumber.from(
        ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
    );
    const lpFairPrice = await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
    const indexFeeAmount = indexAmount.mul(pair.addLpFeeP).div(PERCENTAGE);
    const stableFeeAmount = stableAmount.mul(pair.addLpFeeP).div(PERCENTAGE);
    const indexDepositDelta = indexAmount.sub(indexFeeAmount).mul(pairPrice);
    const usdtDepositDelta = stableAmount.sub(stableFeeAmount);
    const totalDelta = indexDepositDelta.add(usdtDepositDelta);
    const mintDelta = totalDelta.sub(slipDelta ? slipDelta : '0');

    return mintDelta.mul(PRICE_PRECISION).div(lpFairPrice);
}

export async function getLpSlippageDelta(
    testEnv: TestEnv,
    pairIndex: number,
    indexAmount: BigNumber,
    stableAmount: BigNumber,
) {
    const { pool, positionManager, oraclePriceFeed, btc } = testEnv;

    let slipDelta;
    const pair = await pool.getPair(pairIndex);
    const profit = await positionManager.lpProfit(
        pair.pairIndex,
        pair.indexToken,
        await oraclePriceFeed.getPrice(btc.address),
    );
    const vault = await pool.getVault(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);

    // index
    const indexTotalAmount = getTotalAmount(vault.indexTotalAmount, profit);

    const indexReserveDelta = getStableDelta(indexTotalAmount, price);
    const indexFeeAmount = getLpFee(indexAmount, pair.addLpFeeP);
    const afterFeeIndexAmount = indexAmount.sub(indexFeeAmount);
    const indexDepositDelta = getStableDelta(afterFeeIndexAmount, price);
    const indexTotalDelta = indexReserveDelta.add(indexDepositDelta);

    // stable
    const stableTotalAmount = getTotalAmount(vault.stableTotalAmount, profit);
    const stableFeeAmount = getLpFee(stableAmount, pair.addLpFeeP);
    const afterFeeStableAmount = stableAmount.sub(stableFeeAmount);
    const stableTotalDelta = stableTotalAmount.add(afterFeeStableAmount);

    // expect
    const totalDelta = indexTotalDelta.add(stableTotalDelta);
    const expectIndexDelta = totalDelta.mul(pair.expectIndexTokenP).div(PERCENTAGE);
    const expectStableDelta = totalDelta.sub(expectIndexDelta);

    // btc > usdt
    if (indexTotalDelta > expectIndexDelta) {
        const needSwapIndexDelta = indexTotalDelta.sub(expectIndexDelta);
        const swapIndexDelta =
            indexDepositDelta > needSwapIndexDelta ? indexDepositDelta.sub(needSwapIndexDelta) : indexDepositDelta;

        slipDelta = swapIndexDelta.sub(getAmountOut(swapIndexDelta, price, pair.kOfSwap));
    }

    // udst > btc
    if (stableTotalDelta > expectStableDelta) {
        const needSwapStableDelta = stableTotalDelta.sub(expectStableDelta);
        const swapStableDelta =
            afterFeeStableAmount > needSwapStableDelta
                ? afterFeeStableAmount.sub(needSwapStableDelta)
                : afterFeeStableAmount;

        slipDelta = swapStableDelta.sub(getAmountOut(swapStableDelta, price, pair.kOfSwap));
    }

    return slipDelta;
}

function getTotalAmount(totalAmount: BigNumber, profit: BigNumber) {
    if (profit.lt(0)) {
        return totalAmount.sub(profit.abs());
    } else {
        return totalAmount.add(profit.abs());
    }
}

function getStableDelta(amount: BigNumber, price: BigNumber) {
    return amount.mul(price).div(PRICE_PRECISION);
}

function getLpFee(amount: BigNumber, lpFeeRate: BigNumber) {
    return amount.mul(lpFeeRate).div(PERCENTAGE);
}

function getAmountOut(swapDelta: BigNumber, price: BigNumber, k: BigNumber) {
    const swapIndexAmount = swapDelta.mul(PRICE_PRECISION).div(price);
    const reserveB = Math.sqrt(Number(k.mul(price).div(PRICE_PRECISION)));
    const reserveA = k.div(reserveB);
    return swapIndexAmount.mul(reserveB).div(swapIndexAmount.add(reserveA));
}
