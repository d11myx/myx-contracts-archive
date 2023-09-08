import { BigNumber, Contract, ContractTransaction, ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TestEnv } from '../../test/helpers/make-suite';

const PRICE_PRECISION = '1000000000000000000000000000000';
const PERCENTAGE = '100000000';

declare var hre: HardhatRuntimeEnvironment;

export const waitForTx = async (tx: ContractTransaction) => await tx.wait(1);

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

// export const deployUpgradeableContract = async <ContractType extends Contract>(
//     contract: string,
//     args?: any,
// ): Promise<ContractType> => {
//     const [deployer] = await hre.ethers.getSigners();
//
//     const contractFactory = await hre.ethers.getContractFactory(contract, deployer);
//     let contractDeployed = await hre.upgrades.deployProxy(contractFactory, [...args]);
//
//     return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
// };

export const getContract = async <ContractType extends Contract>(
    id: string,
    address?: string,
): Promise<ContractType> => {
    const artifact = await hre.deployments.getArtifact(id);
    return hre.ethers.getContractAt(
        artifact.abi,
        address || (await (await hre.deployments.get(id)).address),
    ) as any as ContractType;
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
 * @description (Clamp([w * (U - V) / K * Q + (1 - w) * (U - V) / K * L ] - Interest, min, max)/) / 365 / (24/4)
 * @param testEnv {TestEnv} current test env
 * @param pairIndex {Number} currency pair index
 * @returns funding rate
 */
export async function getFundingRate(testEnv: TestEnv, pairIndex: number) {
    const { positionManager, pool, oraclePriceFeed } = testEnv;
    const { indexTotalAmount, indexReservedAmount, stableTotalAmount, stableReservedAmount } = await pool.getVault(
        pairIndex,
    );

    const fundingInterval = 28800;
    const fundingFeeConfig = await pool.getFundingFeeConfig(pairIndex);
    const pair = await pool.getPair(pairIndex);
    const price = await oraclePriceFeed.getPrice(pair.indexToken);
    const exposedPosition = await positionManager.getExposedPositions(pairIndex);
    const longTracker = await positionManager.longTracker(pairIndex);
    const shortTracker = await positionManager.shortTracker(pairIndex);

    const uv = exposedPosition.abs().mul(price);
    const q = longTracker.add(shortTracker);
    const w = fundingFeeConfig.fundingWeightFactor;
    const k = fundingFeeConfig.liquidityPremiumFactor;
    const interest = fundingFeeConfig.interest;
    const diffBTCAmount = BigNumber.from(indexTotalAmount).sub(BigNumber.from(indexReservedAmount));
    const diffUSDTAmount = BigNumber.from(stableTotalAmount).sub(BigNumber.from(stableReservedAmount));
    const l = diffBTCAmount.mul(price).div(PRICE_PRECISION).add(diffUSDTAmount);

    let fundingRate, absFundingRate;
    if (q.eq(0)) {
        fundingRate = 0;
    } else {
        absFundingRate = BigNumber.from(w).mul(uv).mul(PERCENTAGE).div(k.mul(q));
        if (!l.eq(0)) {
            absFundingRate = absFundingRate.add(BigNumber.from(PERCENTAGE).sub(w).mul(uv).div(k.mul(l)));
        }
        fundingRate = exposedPosition.gte(0) ? absFundingRate : -absFundingRate;
    }

    fundingRate = BigNumber.from(fundingRate).sub(interest);
    fundingRate = fundingRate.lt(fundingFeeConfig.minFundingRate)
        ? fundingFeeConfig.minFundingRate
        : fundingRate.gt(fundingFeeConfig.maxFundingRate)
        ? fundingFeeConfig.maxFundingRate
        : fundingRate;

    return fundingRate.div(365).div(86400 / fundingInterval);
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
        .add(openPrice.mul(positionAmount))
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
 * calculation current position amount
 *
 * @param epochFundindFee {BigNumber} epoch currency standard funding fee
 * @param positionAmount {BigNumber} current position size
 * @returns current position amount
 */
export function getPositionFundFee(epochFundindFee: BigNumber, positionAmount: BigNumber) {
    return positionAmount.mul(epochFundindFee).div(PERCENTAGE);
}
