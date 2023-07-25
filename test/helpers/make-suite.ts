import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import {
  ExecuteRouter,
  FastPriceFeed,
  PairInfo,
  PairLiquidity,
  PairVault,
  Token,
  TradingRouter,
  TradingUtils,
  TradingVault,
  VaultPriceFeed,
  WETH,
} from '../../types';
import { SymbolMap } from '../shared/types';
import { deployPair, deployPrice, deployToken, deployTrading } from './contract-deployments';
import { initPairs } from './init-helper';

declare var hre: HardhatRuntimeEnvironment;

export interface SignerWithAddress {
  signer: Signer;
  address: string;
}

export interface TestEnv {
  deployer: SignerWithAddress;
  keeper: SignerWithAddress;
  users: SignerWithAddress[];
  weth: WETH;
  btc: Token;
  usdt: Token;
  pairTokens: SymbolMap<Token>;
  pairInfo: PairInfo;
  pairLiquidity: PairLiquidity;
  pairVault: PairVault;
  vaultPriceFeed: VaultPriceFeed;
  fastPriceFeed: FastPriceFeed;
  tradingUtils: TradingUtils;
  tradingVault: TradingVault;
  tradingRouter: TradingRouter;
  executeRouter: ExecuteRouter;
}

export const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  keeper: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  weth: {} as WETH,
  btc: {} as Token,
  usdt: {} as Token,
  pairTokens: {} as SymbolMap<Token>,
  pairInfo: {} as PairInfo,
  pairLiquidity: {} as PairLiquidity,
  pairVault: {} as PairVault,
  vaultPriceFeed: {} as VaultPriceFeed,
  fastPriceFeed: {} as FastPriceFeed,
  tradingUtils: {} as TradingUtils,
  tradingVault: {} as TradingVault,
  tradingRouter: {} as TradingRouter,
  executeRouter: {} as ExecuteRouter,
} as TestEnv;

export async function setupTestEnv() {
  const [_deployer, _keeper, ...restSigners] = await getSigners(hre);
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };
  const keeper: SignerWithAddress = {
    address: await _keeper.getAddress(),
    signer: _keeper,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  // setup tokens
  const { weth, usdt, tokens } = await deployToken();
  testEnv.deployer = deployer;
  testEnv.keeper = keeper;
  testEnv.weth = weth;
  testEnv.usdt = usdt;
  testEnv.pairTokens = tokens;
  testEnv.btc = tokens['BTC'];

  // setup price
  const { vaultPriceFeed, fastPriceFeed } = await deployPrice(deployer);
  testEnv.vaultPriceFeed = vaultPriceFeed;
  testEnv.fastPriceFeed = fastPriceFeed;

  // setup pair
  const { pairInfo, pairLiquidity, pairVault } = await deployPair(vaultPriceFeed, deployer, weth);
  testEnv.pairInfo = pairInfo;
  testEnv.pairLiquidity = pairLiquidity;
  testEnv.pairVault = pairVault;

  // setup trading
  const { tradingUtils, tradingVault, tradingRouter, executeRouter } = await deployTrading(
    deployer,
    pairVault,
    pairInfo,
    vaultPriceFeed,
    fastPriceFeed,
  );
  testEnv.tradingUtils = tradingUtils;
  testEnv.tradingVault = tradingVault;
  testEnv.tradingRouter = tradingRouter;
  testEnv.executeRouter = executeRouter;

  await initPairs(deployer, tokens, usdt, pairInfo);
}

export async function getPairToken(pair: string): Promise<Token> {
  return testEnv.pairTokens[pair];
}
