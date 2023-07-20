import { ethers } from 'hardhat';
import { BaseContract, Contract, ContractTransaction } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

export const waitForTx = async (tx: ContractTransaction) => await tx.wait(1);

export const deployContract = async <ContractType extends Contract>(
  contract: string,
  args?: any,
): Promise<ContractType> => {
  const [deployer] = await ethers.getSigners();

  const contractFactory = await hre.ethers.getContractFactory(contract, deployer);
  const contractDeployed = await contractFactory.deploy(...args);

  return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const deployUpgradeableContract = async <ContractType extends Contract>(
  contract: string,
  args?: any,
): Promise<ContractType> => {
  const [deployer] = await ethers.getSigners();

  const contractFactory = await hre.ethers.getContractFactory(contract, deployer);
  let contractDeployed = await hre.upgrades.deployProxy(contractFactory, [...args]);

  return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const getContractAt = async <ContractType extends BaseContract>(
  contract: string,
  address: string,
): Promise<ContractType> => {
  return (await hre.ethers.getContractAt(contract, address)) as any as ContractType;
};

export const latestBlockNumber = async (): Promise<number> => {
  const block = await ethers.provider.getBlock('latest');
  if (!block) {
    throw `latestBlockNumber: missing block`;
  }
  return block.number;
};

export const getBlockTimestamp = async (blockNumber?: number): Promise<number> => {
  if (!blockNumber) {
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw `getBlockTimestamp: missing block number ${blockNumber}`;
    }
    return block.timestamp;
  }
  const block = await ethers.provider.getBlock(blockNumber);
  if (!block) {
    throw `getBlockTimestamp: missing block number ${blockNumber}`;
  }
  return block.timestamp;
};
