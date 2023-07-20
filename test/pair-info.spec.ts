import { ethers } from 'hardhat';
import { PairVault, PairInfo, ERC20Faucet } from '../typechain-types/';
import { expect } from './shared/expect';
import { Decimal } from 'decimal.js';

describe('pair vault', () => {
  let pairInfo: PairInfo;
  let eth;
  before('deploy FullMathTest', async () => {
    const ParirInfoContract = await ethers.getContractFactory('PairInfo');
    pairInfo = (await ParirInfoContract.deploy()) as PairInfo;

    //    = await contractAt("WETH", await getConfig("Token-ETH"))
    //   let btc = await contractAt("Token", await getConfig("Token-BTC"))
    //   let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  });
  describe('pair info', () => {
    it(' test pair info', () => {});
  });
});
