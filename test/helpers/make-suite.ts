import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Contract, Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import { PairInfo, PairLiquidity, PairVault, Token, VaultPriceFeedTest, WETH } from '../../types/ethers-contracts';
import { deployMockToken, deployWETH } from './contract-deployments';
import { deployUpgradeableContract, waitForTx } from './tx';

declare var hre: HardhatRuntimeEnvironment;

export interface SignerWithAddress {
  signer: Signer;
  address: string;
}

export interface TestEnv {
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
  weth: WETH;
  btc: Token;
  usdt: Token;
  pairInfo: PairInfo;
  pairLiquidity: PairLiquidity;
  pairVault: PairVault;
}

export const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  weth: {} as WETH,
  btc: {} as Token,
  usdt: {} as Token,
  pairInfo: {} as PairInfo,
  pairLiquidity: {} as PairLiquidity,
  pairVault: {} as PairVault,
} as TestEnv;

export async function setupTestEnv() {
  const [_deployer, ...restSigners] = await getSigners(hre);
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }

  const weth = await deployWETH();
  const btc = await deployMockToken('BTC');
  const usdt = await deployMockToken('USDT');

  testEnv.deployer = deployer;
  testEnv.weth = weth;
  testEnv.btc = btc;
  testEnv.usdt = usdt;

  const vaultPriceFeed = (await deployUpgradeableContract('VaultPriceFeedTest', [])) as any as VaultPriceFeedTest;
  const pairInfo = (await deployUpgradeableContract('PairInfo', [])) as any as PairInfo;
  const pairVault = (await deployUpgradeableContract('PairVault', [pairInfo.address])) as any as PairVault;
  const pairLiquidity = (await deployUpgradeableContract('PairLiquidity', [
    pairInfo.address,
    pairVault.address,
    vaultPriceFeed.address,
    deployer.address,
    deployer.address,
    weth.address,
  ])) as any as PairLiquidity;

  await waitForTx(await pairLiquidity.setHandler(pairInfo.address, true));
  await waitForTx(await pairVault.setHandler(pairLiquidity.address, true));
  await waitForTx(await pairInfo.setPairLiquidity(pairLiquidity.address));

  testEnv.pairInfo = pairInfo;
  testEnv.pairLiquidity = pairLiquidity;
  testEnv.pairVault = pairVault;
}
