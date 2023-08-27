import { ethers, waffle } from 'hardhat';
import { expect } from './shared/expect';

import snapshotGasCost from './shared/snapshotGasCost';
import { TestGas, TestMulticall } from '../types';

describe('TestGas', async () => {
    const wallets = waffle.provider.getWallets();

    let testGas: TestGas;

    beforeEach('create multicall', async () => {
        const testGasFacory = await ethers.getContractFactory('TestGas');
        testGas = (await testGasFacory.deploy()) as TestGas;
    });
    it('', async () => {
         expect(await testGas.owner()).to.be.eq(wallets[0].address);
    });

    it('gas cost test maping(address=>struct)', async () => {
        await snapshotGasCost(testGas.saveIncreasePosit());
    });

    it('gas cost of saveOrderWithTpSl', async () => {
        await snapshotGasCost(testGas.saveOrderWithTpSl());
    });

    it('gas cost of testKey', async () => {
        await snapshotGasCost(testGas.testKey('1'));
    });

    it('gas cost of testKeys', async () => {
        await snapshotGasCost(testGas.testKeys('1'));
    });
});
