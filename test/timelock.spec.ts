import { testEnv } from './helpers/make-suite';
import { Duration, increase, increaseTo, latest, waitForTx } from '../helpers/utilities/tx';
import { loadReserveConfig } from '../helpers/market-config-helper';
import { expect } from './shared/expect';
import { IPool, TestOwnableToken, Timelock } from '../types';
import { BigNumber } from 'ethers';
import { deployMockToken } from '../helpers/contract-deployments';
import { MARKET_NAME } from '../helpers/env';
import snapshotGasCost from './shared/snapshotGasCost';
import { ethers } from 'hardhat';
import { deployContract } from '../helpers/utilities/tx';
import { ZERO_ADDRESS } from '../helpers';
import {
    getCurrentTimestamp,
    getCurrentTimestampBigInt,
} from 'hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp';

function encodeParameters(types: string[], values: string[]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

describe('Timelock', () => {
    let timelock: Timelock;
    let testToken: TestOwnableToken;
    beforeEach(async () => {
        const { poolAdmin, pool, usdt } = testEnv;

        timelock = (await deployContract('Timelock', ['43200'])) as Timelock;
        testToken = (await deployContract('TestOwnableToken', [])) as TestOwnableToken;
        let timestamp = await latest();
        let eta = Duration.days(3);
        await timelock.queueTransaction(
            timelock.address,
            '0',
            'setDelay(uint256)',
            encodeParameters(['uint256'], ['300000']),
            eta.add(timestamp),
        );
        await increase(Duration.days(4));
        await timelock.executeTransaction(
            timelock.address,
            '0',
            'setDelay(uint256)',
            encodeParameters(['uint256'], ['300000']),
            eta.add(timestamp),
        );
        expect(await timelock.delay()).to.be.eq('300000');

        // await timelock.setPendingAdmin(alice, {from: bob});
    });

    it('should not allow non-owner to do operation', async () => {
        const {
            deployer,
            pool,
            usdt,
            users: [depositor, carol, alice],
        } = testEnv;
        expect(await timelock.pendingAdmin()).to.be.eq(ZERO_ADDRESS);
        expect(await timelock.admin()).to.be.eq(deployer.address);
        await testToken.transferOwnership(timelock.address);
        await expect(testToken.transferOwnership(carol.address)).to.be.revertedWith('Ownable: caller is not the owner');
        let timestamp = await latest();
        let eta = Duration.days(4);
        await expect(
            timelock
                .connect(alice.signer)
                .queueTransaction(
                    testToken.address,
                    '0',
                    'transferOwnership(address)',
                    encodeParameters(['address'], [carol.address]),
                    timestamp.add(eta),
                ),
        ).to.be.revertedWith('queueTransaction: Call must come from admin.');
    });

    it('should do the timelock thing', async () => {
        const {
            deployer,
            pool,
            usdt,
            users: [depositor, carol, alice],
        } = testEnv;
        await testToken.transferOwnership(timelock.address);
        let timestamp = await latest();
        let eta = Duration.days(4);
        console.log('timestamp:' + timestamp);
        console.log('eta:' + eta);
        await timelock.queueTransaction(
            testToken.address,
            '0',
            'transferOwnership(address)',
            encodeParameters(['address'], [carol.address]),
            timestamp.add(eta),
        );
        await increase(Duration.days(1));
        await expect(
            timelock.executeTransaction(
                testToken.address,
                '0',
                'transferOwnership(address)',
                encodeParameters(['address'], [carol.address]),
                timestamp.add(eta),
            ),
        ).to.be.revertedWith("Transaction hasn't surpassed time lock.");
        await increase(Duration.days(4));
        await timelock.executeTransaction(
            testToken.address,
            '0',
            'transferOwnership(address)',
            encodeParameters(['address'], [carol.address]),
            timestamp.add(eta),
        );
        expect(await testToken.owner()).to.be.eq(carol.address);
    });
    it('test cancelTransaction', async () => {
        const {
            deployer,
            pool,
            usdt,
            users: [depositor, carol, alice],
        } = testEnv;
        await testToken.transferOwnership(timelock.address);

        let eta = (await latest()).add(Duration.days(4));
        await timelock.queueTransaction(
            testToken.address,
            '0',
            'transferOwnership(address)',
            encodeParameters(['address'], [carol.address]),
            eta,
        );
        await increase(Duration.days(4));

        await timelock.cancelTransaction(
            testToken.address,
            '0',
            'transferOwnership(address)',
            encodeParameters(['address'], [carol.address]),
            eta,
        );
        expect(await testToken.owner()).to.be.eq(timelock.address);
    });
    it('test acceptAdmin', async () => {
        const {
            deployer,
            pool,
            usdt,
            users: [depositor, carol, alice],
        } = testEnv;
        await timelock.setPendingAdmin(alice.address);
        expect(await timelock.pendingAdmin()).to.be.eq(alice.address);
        console.log(await timelock.pendingAdmin());
        await timelock.connect(alice.signer).acceptAdmin();
        let pendingAdmin = await timelock.pendingAdmin();
        expect(pendingAdmin).to.be.eq(ZERO_ADDRESS);
        expect(await timelock.admin()).to.be.eq(alice.address);
    });
    it('test setPendingAdmin', async () => {
        const {
            deployer,
            pool,
            usdt,
            users: [depositor, carol, alice],
        } = testEnv;

        let eta = (await latest()).add(Duration.days(4));
        await timelock.queueTransaction(
            timelock.address,
            '0',
            'setPendingAdmin(address)',
            encodeParameters(['address'], [carol.address]),
            eta,
        );
        await increase(Duration.days(4));
        await timelock.executeTransaction(
            timelock.address,
            '0',
            'setPendingAdmin(address)',
            encodeParameters(['uint256'], [carol.address]),
            eta,
        );
        // await timelock.setPendingAdmin(carol, {from: bob});
        expect(await timelock.pendingAdmin()).to.be.eq(carol.address);
    });
});
