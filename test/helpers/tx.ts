import { ethers } from 'hardhat';

export const waitForTx = async (tx) => {
  await tx.wait(1);
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
