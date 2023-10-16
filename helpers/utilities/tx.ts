import { BigNumber, Contract, ContractTransaction, ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TestEnv } from '../../test/helpers/make-suite';
import { DeployOptions, DeployResult } from 'hardhat-deploy/types';
import { DeployProxyOptions } from '@openzeppelin/hardhat-upgrades/dist/utils';

import BN from 'bn.js';

import { string } from 'yargs';

const PRICE_PRECISION = '1000000000000000000000000000000';
const PERCENTAGE = '100000000';

declare var hre: HardhatRuntimeEnvironment;

export const waitForTx = async (tx: ContractTransaction) => await tx.wait(1);

export const deployProxy = async (
    name: string,
    constructorArgs: any[],
    options: DeployOptions,
): Promise<DeployResult> => {
    const contract = await deployUpgradeableContract(options.contract as string, options.args, {
        constructorArgs: constructorArgs,
        initializer: `initialize`,
    });

    const factory = await hre.ethers.getContractFactory(options.contract as string);

    const artifact = await hre.artifacts.readArtifact(options.contract as string);
    await hre.deployments.save(name, {
        abi: artifact.abi,
        args: options.args,
        bytecode: artifact.bytecode,
        deployedBytecode: artifact.deployedBytecode,
        devdoc: undefined,
        execute: { args: [], methodName: '' },
        facets: [],
        factoryDeps: [],
        gasEstimates: undefined,
        history: [],
        implementation: '',
        libraries: undefined,
        linkedData: undefined,
        metadata: '',
        methodIdentifiers: undefined,
        receipt: undefined,
        solcInput: '',
        solcInputHash: '',
        storageLayout: undefined,
        transactionHash: '',
        userdoc: undefined,
        address: contract.address,
    });

    // await new Promise((f) => setTimeout(f, 10000));

    return {
        abi: artifact.abi,
        address: contract.address,
        args: options.args,
        bytecode: artifact.bytecode,
        deployedBytecode: artifact.deployedBytecode,
        devdoc: undefined,
        facets: [],
        factoryDeps: [],
        gasEstimates: undefined,
        history: [],
        implementation: '',
        libraries: undefined,
        linkedData: undefined,
        metadata: '',
        methodIdentifiers: undefined,
        newlyDeployed: false,
        numDeployments: 0,
        receipt: undefined,
        solcInputHash: '',
        storageLayout: undefined,
        transactionHash: '',
        userdoc: undefined,
    };
};

export const deployContract = async <ContractType extends Contract>(
    contract: string,
    args?: any,
    libs?: { [libraryName: string]: string },
): Promise<ContractType> => {
    const [deployer] = await hre.ethers.getSigners();

    const contractFactory = await hre.ethers.getContractFactory(contract, {
        signer: deployer,
        libraries: {
            ...libs,
        },
    });

    const contractDeployed = await contractFactory.deploy(...args);

    return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const deployUpgradeableContract = async <ContractType extends Contract>(
    contract: string,
    args?: any[],
    opts?: DeployProxyOptions,
): Promise<ContractType> => {
    const [deployer] = await hre.ethers.getSigners();

    const contractFactory = await hre.ethers.getContractFactory(contract, deployer);
    let contractDeployed = await hre.upgrades.deployProxy(contractFactory, args, opts);

    return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const getContract = async <ContractType extends Contract>(
    id: string,
    address?: string,
): Promise<ContractType> => {
    const artifact = await hre.deployments.getArtifact(id);
    return (await hre.ethers.getContractAt(
        artifact.abi,
        address || (await hre.deployments.get(id)).address,
    )) as any as ContractType;
};

interface AccountItem {
    name: string;
    account: string;
    balance: string;
}

export const getWalletBalances = async () => {
    const accounts = await hre.getNamedAccounts();

    const acc: AccountItem[] = [];
    for (let accKey of Object.keys(accounts)) {
        acc.push({
            name: accKey,
            account: accounts[accKey],
            balance: ethers.utils.formatEther(await hre.ethers.provider.getBalance(accounts[accKey])),
        });
    }
    return acc;
};

export const latestBlockNumber = async (): Promise<number> => {
    const block = await hre.ethers.provider.getBlock('latest');
    if (!block) {
        throw `latestBlockNumber: missing block`;
    }
    return block.number;
};

export const getBlockTimestamp = async (blockNumber?: number): Promise<number> => {
    if (!blockNumber) {
        const block = await hre.ethers.provider.getBlock('latest');
        if (!block) {
            throw `getBlockTimestamp: missing block number ${blockNumber}`;
        }
        return block.timestamp;
    }
    const block = await hre.ethers.provider.getBlock(blockNumber);
    if (!block) {
        throw `getBlockTimestamp: missing block number ${blockNumber}`;
    }
    return block.timestamp;
};

export async function latest() {
    const block = await hre.ethers.provider.getBlock('latest');
    return BigNumber.from(block.timestamp);
}

export async function latestBlock() {
    const block = await hre.ethers.provider.getBlock('latest');
    return BigNumber.from(block.number);
}

export async function advanceBlock() {
    await hre.ethers.provider.send('evm_mine', []);
}

export async function increase(duration: any) {
    if (!BigNumber.isBigNumber(duration)) {
        duration = BigNumber.from(duration);
    }

    // if (duration.isNeg()) throw Error(`Cannot increase time by a negative amount (${duration})`);

    await hre.ethers.provider.send('evm_increaseTime', [duration.toNumber()]);

    await advanceBlock();
}

export async function increaseTo(target: any) {
    if (!BigNumber.isBigNumber(target)) {
        target = BigNumber.from(target);
    }

    const now = await latest();

    if (target.lt(now)) throw Error(`Cannot increase current time (${now}) to a moment in the past (${target})`);
    const diff = target.sub(now);
    return increase(diff);
}

export const Duration = {
    seconds: function (val: any) {
        return BigNumber.from(val);
    },
    minutes: function (val: any) {
        return BigNumber.from(val).mul(this.seconds('60'));
    },
    hours: function (val: any) {
        return BigNumber.from(val).mul(this.minutes('60'));
    },
    days: function (val: any) {
        return BigNumber.from(val).mul(this.hours('24'));
    },
    weeks: function (val: any) {
        return BigNumber.from(val).mul(this.days('7'));
    },
    years: function (val: any) {
        return BigNumber.from(val).mul(this.days('365'));
    },
};

/**
 * calculation epoch funding rate
 *
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @returns funding rate
 */
export async function getFundingRateInTs(testEnv: TestEnv, pairIndex: number) {
    const { positionManager, pool, fundingRate, oraclePriceFeed } = testEnv;
    const { indexTotalAmount, stableTotalAmount } = await pool.getVault(pairIndex);

    const pair = await pool.getPair(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);
    const fundingFeeConfig = await fundingRate.fundingFeeConfigs(pairIndex);
    const longTracker = await positionManager.longTracker(pairIndex);
    const shortTracker = await positionManager.shortTracker(pairIndex);

    const u = longTracker;
    const v = shortTracker;
    const l = indexTotalAmount.add(stableTotalAmount.mul(PRICE_PRECISION).div(price));
    const k = fundingFeeConfig.growthRate;
    const r = fundingFeeConfig.baseRate;
    const maxRate = fundingFeeConfig.maxRate;
    const fundingInterval = fundingFeeConfig.fundingInterval;

    // A = (U/U+V - 0.5) * MAX(U,V)/L * 100
    const max = u.gt(v) ? u : v;
    let a = u.eq(v)
        ? 0
        : u
              .mul(PERCENTAGE)
              .div(u.add(v))
              .sub(BigNumber.from(PERCENTAGE).div(2))
              .mul(max.mul(PERCENTAGE).div(l))
              .mul(100)
              .div(PERCENTAGE);
    a = BigNumber.from(a);

    // S = ABS(2*R-1)=ABS(U-V)/(U+V)
    let s = u.eq(v) ? 0 : u.sub(v).abs().mul(PERCENTAGE).div(u.add(v));
    s = BigNumber.from(s);

    // G1 = MIN((S+S*S/2) * k + r, r(max))
    const min = s.mul(s).div(2).div(PERCENTAGE).add(s).mul(k).div(PERCENTAGE).add(r);
    const g1 = min.lt(maxRate) ? min : maxRate;
    if (u.eq(v)) {
        return g1;
    }

    // G1+ABS(G1*A/10) * (u-v)/abs(u-v)
    let currentFundingFee = g1.add(g1.mul(a.abs()).div(10).div(PERCENTAGE));
    if (u.lt(v)) {
        currentFundingFee = currentFundingFee.mul(-1);
    }
    return currentFundingFee.div(86400 / fundingInterval.toNumber());
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
export function getPositionFundingFee(
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

    return positionAmount.mul(diffFundingFeeTracker.abs()).div(PERCENTAGE).mul(fundingFee);
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
    positionAmount: BigNumber,
    isLong: boolean,
) {
    const { positionManager, pool, oraclePriceFeed } = testEnv;

    const pair = await pool.getPair(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);
    const currentExposureAmountChecker = await positionManager.getExposedPositions(pairIndex);
    const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
    const positionPrice = positionAmount.mul(price).div(PRICE_PRECISION);
    let tradingFee;

    if (currentExposureAmountChecker.gte(0)) {
        tradingFee = isLong
            ? positionPrice.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE)
            : positionPrice.mul(tradingFeeConfig.makerFeeP).div(PERCENTAGE);
    } else {
        tradingFee = isLong
            ? positionPrice.mul(tradingFeeConfig.makerFeeP).div(PERCENTAGE)
            : positionPrice.mul(tradingFeeConfig.takerFeeP).div(PERCENTAGE);
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
    const { pool } = testEnv;
    const levelDiscountRatios = [0, 1e6, 2e6, 3e6, 4e6, 5e6];

    let vipRate = 0;
    const tradingFeeConfig = await pool.getTradingFeeConfig(pairIndex);
    if (vipLevel > 0 && vipLevel <= levelDiscountRatios.length) {
        vipRate = levelDiscountRatios[vipLevel];
    }
    const vipAmount = tradingFee.mul(vipRate).div(PERCENTAGE);
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
    const { pool, oraclePriceFeed, btc } = testEnv;

    const pair = await pool.getPair(pairIndex);
    const pairPrice = BigNumber.from(
        ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
    );
    const lpFairPrice = await pool.lpFairPrice(pairIndex);
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
    const { pool } = testEnv;

    let slipDelta;
    const pair = await pool.getPair(pairIndex);
    const profit = await pool.getProfit(pair.pairIndex, pair.indexToken);
    const vault = await pool.getVault(pairIndex);
    const price = await pool.getPrice(pair.indexToken);

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


export function encodeParameters(types: string[], values: string[]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

export function encodeParameterArray(types: string[], values: string[][]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

