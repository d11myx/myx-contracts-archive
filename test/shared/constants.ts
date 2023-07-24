import { ethers } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';

export const ONE_ETHER = ethers.utils.parseEther('1');
export const MAX_UINT_AMOUNT = ethers.constants.MaxUint256;
export const ZERO_ADDRESS = ethers.constants.AddressZero;

export enum eEthereumNetwork {
  main = 'mainnet',
  goerli = 'goerli',
}

export enum eBscNetwork {
  main = 'mainnet',
  test = 'testnet',
}

export type eNetwork = eEthereumNetwork | eBscNetwork;

export const MOCK_PRICES: { [key: string]: string } = {
  BTC: parseUnits('30000', 8).toString(),
  ETH: parseUnits('2000', 8).toString(),
};
