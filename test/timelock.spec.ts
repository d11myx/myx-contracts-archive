import { testEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { TestOwnableToken, Timelock } from '../types';
import { deployContract } from '../helpers';
import { Duration, encodeParameters, increase, latest, ZERO_ADDRESS } from '../helpers';

describe('Timelock', () => {
    let timelock: Timelock;
    let testToken: TestOwnableToken;
    beforeEach(async () => {
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
            users: [, carol, alice],
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
            users: [, carol],
        } = testEnv;
        await testToken.transferOwnership(timelock.address);
        let timestamp = await latest();
        let eta = Duration.days(4);
        // console.log('timestamp:' + timestamp);
        // console.log('eta:' + eta);
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
            users: [, carol],
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
            users: [, , alice],
        } = testEnv;
        await timelock.setPendingAdmin(alice.address);
        expect(await timelock.pendingAdmin()).to.be.eq(alice.address);
        // console.log(await timelock.pendingAdmin());
        await timelock.connect(alice.signer).acceptAdmin();
        let pendingAdmin = await timelock.pendingAdmin();
        expect(pendingAdmin).to.be.eq(ZERO_ADDRESS);
        expect(await timelock.admin()).to.be.eq(alice.address);
        await expect(timelock.connect(alice.signer).setPendingAdmin(alice.address)).to.be.revertedWith(
            'Call must come from Timelock.',
        );
    });
    it('test setPendingAdmin', async () => {
        const {
            users: [, carol, alice],
        } = testEnv;

        await timelock.setPendingAdmin(alice.address);
        await timelock.connect(alice.signer).acceptAdmin();
        let eta = (await latest()).add(Duration.days(4));
        await timelock
            .connect(alice.signer)
            .queueTransaction(
                timelock.address,
                '0',
                'setPendingAdmin(address)',
                encodeParameters(['address'], [carol.address]),
                eta,
            );
        await increase(Duration.days(5));
        await timelock
            .connect(alice.signer)
            .executeTransaction(
                timelock.address,
                '0',
                'setPendingAdmin(address)',
                encodeParameters(['address'], [carol.address]),
                eta,
            );
        expect(await timelock.pendingAdmin()).to.be.eq(carol.address);
        await timelock.connect(carol.signer).acceptAdmin();
        expect(await timelock.pendingAdmin()).to.be.eq(ZERO_ADDRESS);
        expect(await timelock.admin()).to.be.eq(carol.address);
    });
});
