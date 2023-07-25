import { Signer } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

export const getEthersSigners = async (): Promise<Signer[]> => {
  return await hre.ethers.getSigners();
};

export const getEthersSignersAddresses = async (): Promise<string[]> =>
  await Promise.all((await getEthersSigners()).map((signer) => signer.getAddress()));

export const getFirstSigner = async () => (await getEthersSigners())[0];
