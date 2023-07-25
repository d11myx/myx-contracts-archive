import { ethers } from 'hardhat';
import { PairVault, PairInfo } from '../types';
import { expect } from './shared/expect';
import { Decimal } from 'decimal.js';

Decimal.config({ toExpNeg: -500, toExpPos: 500 });

describe('pair vault', () => {
  let pairVault: PairVault;
  let pairInfo: PairInfo;
  before('deploy FullMathTest', async () => {
    const PairVaultContract = await ethers.getContractFactory('PairVault');
    pairVault = (await PairVaultContract.deploy()) as any as PairVault;
    const ParirInfoContract = await ethers.getContractFactory('PairInfo');
    pairInfo = (await ParirInfoContract.deploy()) as any as PairInfo;
    await pairVault.initialize(pairInfo.address);
  });

  describe('pair info', () => {
    it('test pair info', async () => {
      expect(await pairVault.pairInfo()).to.be.eq(pairInfo.address);
    });
  });
});
