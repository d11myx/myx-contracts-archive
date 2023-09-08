import { testEnv } from './helpers/make-suite';
import { Duration, increase, increaseTo, waitForTx } from '../helpers/utilities/tx';
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
        let timestamp = getCurrentTimestamp();
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
        const { deployer, pool, usdt } = testEnv;
        expect(await timelock.pendingAdmin()).to.be.eq(ZERO_ADDRESS);
        expect(await timelock.admin()).to.be.eq(deployer.address);
        await testToken.transferOwnership(timelock.address);
        // await expect(testToken.transferOwnership(carol, { from: alice }), 'Ownable: caller is not the owner');
        // await expectRevert(testToken.transferOwnership(carol, { from: bob }), 'Ownable: caller is not the owner');
        // await expectRevert(
        //     timelock.queueTransaction(
        //         testToken.address,
        //         '0',
        //         'transferOwnership(address)',
        //         encodeParameters(['address'], [carol]),
        //         (await time.latest()).add(time.duration.days(4)),
        //         { from: alice },
        //     ),
        //     'Timelock::queueTransaction: Call must come from admin.',
        // );
    });

    // it('should do the timelock thing', async () => {
    //     await testToken.transferOwnership(timelock.address, {from: alice});
    //     const eta = (await time.latest()).add(time.duration.days(4));
    //     await timelock.queueTransaction(
    //         testToken.address, '0', 'transferOwnership(address)',
    //         encodeParameters(['address'], [carol]), eta, {from: bob},
    //     );
    //     await time.increase(time.duration.days(1));
    //     await expectRevert(
    //         timelock.executeTransaction(
    //             testToken.address, '0', 'transferOwnership(address)',
    //             encodeParameters(['address'], [carol]), eta, {from: bob},
    //         ),
    //         "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
    //     );
    //     await time.increase(time.duration.days(4));
    //     await timelock.executeTransaction(
    //         testToken.address, '0', 'transferOwnership(address)',
    //         encodeParameters(['address'], [carol]), eta, {from: bob},
    //     );
    //     assert.equal((await testToken.owner()).valueOf(), carol);
    // });
    // it('test cancelTransaction', async () => {
    //     assert.equal(await testToken.owner().valueOf(), alice);
    //     await testToken.transferOwnership(timelock.address, {from: alice});
    //     assert.equal(await testToken.owner().valueOf(), timelock.address);

    //     let eta = (await time.latest()).add(time.duration.days(4));
    //     await timelock.queueTransaction(
    //         testToken.address, '0', 'transferOwnership(address)',
    //         encodeParameters(['address'], [carol]), eta, {from: bob},
    //     );
    //     await time.increase(time.duration.days(4));

    //     eta = (await time.latest()).add(time.duration.days(4));

    //     await timelock.cancelTransaction(
    //         testToken.address, '0', 'transferOwnership(address)',
    //         encodeParameters(['address'], [carol]), eta, {from: bob},
    //     );
    //     assert.equal(await testToken.owner().valueOf(), timelock.address);

    // });
    // it("test acceptAdmin", async () => {
    //     assert.equal(await timelock.pendingAdmin(), alice);
    //     await timelock.acceptAdmin();
    //     assert.equal(await timelock.pendingAdmin(), zeroAddress);

    // });
    // it("test setPendingAdmin", async () => {
    //     assert.equal(await timelock.pendingAdmin(), alice);

    //     let eta = (await time.latest()).add(time.duration.days(4));
    //     await timelock.queueTransaction(
    //         timelock.address, '0', 'setPendingAdmin(address)',
    //         encodeParameters(['address'],
    //             [carol]), eta, {from: bob}
    //     );
    //     await time.increase(time.duration.days(4));
    //     await timelock.executeTransaction(
    //         timelock.address, '0', 'setPendingAdmin(address)',
    //         encodeParameters(['uint256'],
    //             [carol]), eta, {from: bob}
    //     );
    //     // await timelock.setPendingAdmin(carol, {from: bob});
    //     assert.equal(await timelock.pendingAdmin(), carol);

    // });
});
