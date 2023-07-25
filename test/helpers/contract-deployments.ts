import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Token, VaultPriceFeedTest, WETH } from '../../types';
import { deployContract } from './tx';

declare var hre: HardhatRuntimeEnvironment;

export const deployMockToken = async (symbol: string): Promise<Token> => {
  return await deployContract<Token>('Token', [symbol]);
};

export const deployWETH = async (): Promise<WETH> => {
  return await deployContract<WETH>('WETH', ['WETH', 'WETH', '18']);
};
