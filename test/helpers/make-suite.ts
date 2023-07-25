import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import {
  FastPriceEvents,
  FastPriceFeed,
  PairInfo,
  PairLiquidity,
  PairVault,
  PriceFeed,
  Token,
  VaultPriceFeed,
  WETH,
} from '../../types/ethers-contracts';
import { deployMockToken, deployWETH } from './contract-deployments';
import { deployContract, deployUpgradeableContract, waitForTx } from './tx';
import { loadCurrentPairConfigs } from './market-config-helper';
import { SymbolMap } from '../shared/types';
import { getMarketSymbol, MOCK_PRICES } from '../shared/constants';

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
  pairTokens: SymbolMap<Token>;
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
  pairTokens: {} as SymbolMap<Token>,
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
  const { weth, usdt, tokens } = await deployToken();

  testEnv.deployer = deployer;
  testEnv.weth = weth;
  testEnv.usdt = usdt;
  testEnv.pairTokens = tokens;
  testEnv.btc = tokens['BTC'];

  const { vaultPriceFeed } = await deployPrice(deployer);

  const { pairInfo, pairLiquidity, pairVault } = await deployPair(vaultPriceFeed, deployer, weth);

  testEnv.pairInfo = pairInfo;
  testEnv.pairLiquidity = pairLiquidity;
  testEnv.pairVault = pairVault;
}

export async function deployToken() {
  console.log(` - setup tokens`);

  // basic token
  const usdt = await deployMockToken(getMarketSymbol());
  console.log(`deployed USDT at ${usdt.address}`);

  const weth = await deployWETH();
  console.log(`deployed WETH at ${weth.address}`);

  // pairs token
  const pairConfigs = loadCurrentPairConfigs();

  const tokens: SymbolMap<Token> = {};
  for (let pair of Object.keys(pairConfigs)) {
    const token = await deployMockToken(pair);
    console.log(`deployed ${pair} at ${token.address}`);

    tokens[pair] = token;
  }
  return { usdt, weth, tokens };
}

export async function getPairToken(pair: string): Promise<Token> {
  return testEnv.pairTokens[pair];
}

export async function deployPrice(deployer: SignerWithAddress) {
  console.log(` - setup price`);

  const pairConfigs = loadCurrentPairConfigs();

  const vaultPriceFeed = (await deployContract('VaultPriceFeed', [])) as any as VaultPriceFeed;

  const pairTokenAddresses = [];
  for (let pair of Object.keys(pairConfigs)) {
    const priceFeed = (await deployContract('PriceFeed', [])) as any as PriceFeed;
    console.log(`deployed PriceFeed with ${pair} at ${priceFeed.address}`);

    await priceFeed.connect(deployer.signer).setLatestAnswer(MOCK_PRICES[pair]);
    await priceFeed.connect(deployer.signer).setAdmin(deployer.address, true);

    const pairTokenAddress = (await getPairToken(pair)).address;
    await vaultPriceFeed.setTokenConfig(pairTokenAddress, priceFeed.address, 8, false);

    pairTokenAddresses.push(pairTokenAddress);
  }
  await vaultPriceFeed.setPriceSampleSpace(1);

  const fastPriceEvents = (await deployContract('FastPriceEvents', [])) as any as FastPriceEvents;
  const fastPriceFeed = (await deployContract('FastPriceFeed', [
    5 * 60, // _priceDuration
    120 * 60, // _maxPriceUpdateDelay
    2, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    deployer.address, // _tokenManager
  ])) as any as FastPriceFeed;

  await fastPriceFeed.initialize(1, [deployer.address], [deployer.address]);
  await fastPriceFeed.setTokens(pairTokenAddresses, [10, 10]);
  await fastPriceFeed.connect(deployer.signer).setPriceDataInterval(300);
  await fastPriceFeed.setMaxTimeDeviation(10000);
  await fastPriceFeed.setUpdater(deployer.address, true);
  await fastPriceEvents.setIsPriceFeed(fastPriceFeed.address, true);

  return { vaultPriceFeed, fastPriceFeed, fastPriceEvents };
}

export async function deployPair(vaultPriceFeed: VaultPriceFeed, deployer: SignerWithAddress, weth: WETH) {
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

  return { pairInfo, pairLiquidity, pairVault };
}
