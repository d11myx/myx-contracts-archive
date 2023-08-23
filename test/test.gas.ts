import { ethers, waffle } from 'hardhat';
import { expect } from './shared/expect';

import snapshotGasCost from './shared/snapshotGasCost';
import { TestGas, TestMulticall } from '../types';

describe('Multicall', async () => {
    const wallets = waffle.provider.getWallets();

    let testGas: TestGas ;

    beforeEach('create multicall', async () => {
        const testGasFacory = await ethers.getContractFactory('TestGas');
        testGas = (await testGasFacory.deploy()) as TestGas;
    });



    it('gas cost of uint256', async () => {
        await snapshotGasCost(testGas.testKey("1"));
    });

    // it('gas cost of maping(address=>uint256)', async () => {
    //     await snapshotGasCost(testGas.testKeys("1"));
    // });
});
