import { ethers, waffle } from 'hardhat';
import { expect } from './shared/expect';

import snapshotGasCost from './shared/snapshotGasCost';
import { TestGas } from '../types';
import { ZERO_ADDRESS, ZERO_HASH } from '../helpers';

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
    it('gas cost of infos', async () => {
        await snapshotGasCost(testGas.saveInfos());
    });
    it('gas cost of saveUint256Tests', async () => {
        await snapshotGasCost(testGas.saveUint256Tests());
    });
    it('gas cost of saveUint32Tests', async () => {
        await snapshotGasCost(testGas.saveUint32Tests());
    });

    it('gas cost of calldata params', async () => {
        await snapshotGasCost(
            testGas.calldataParams(
                [ZERO_ADDRESS],
                [ethers.utils.parseEther('1')],
                [ZERO_HASH],
                [
                    {
                        positionKey: ZERO_HASH,
                        sizeAmount: ethers.utils.parseEther('1'),
                        tier: 1,
                        referralsRatio: '1000',
                        referralUserRatio: '1000',
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
            ),
        );
    });

    it('gas cost of memory params', async () => {
        await snapshotGasCost(
            testGas.memoryParams(
                [ZERO_ADDRESS],
                [ethers.utils.parseEther('1')],
                [ZERO_HASH],
                [
                    {
                        positionKey: ZERO_HASH,
                        sizeAmount: ethers.utils.parseEther('1'),
                        tier: 1,
                        referralsRatio: '1000',
                        referralUserRatio: '1000',
                        referralOwner: ZERO_ADDRESS,
                    },
                ],
            ),
        );
    });
});
