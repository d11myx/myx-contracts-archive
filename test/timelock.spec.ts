// const {expectRevert, time} = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const TestOwnableToken = artifacts.require('TestOwnableToken');
const Timelock = artifacts.require('Timelock');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.testToken = await TestOwnableToken.new({from: alice});
        this.timelock = await Timelock.new(bob, '259200', {from: alice});
        zeroAddress = "0x0000000000000000000000000000000000000000";


        let eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.timelock.address, '0', 'setDelay(uint256)',
            encodeParameters(['uint256'],
                ['300000']), eta, {from: bob}
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.timelock.address, '0', 'setDelay(uint256)',
            encodeParameters(['uint256'],
                ['300000']), eta, {from: bob}
        );
        assert.equal(await this.timelock.delay(), "300000");

        assert.equal(await this.timelock.pendingAdmin(), zeroAddress);
        await this.timelock.setPendingAdmin(alice, {from: bob});
        assert.equal(await this.timelock.pendingAdmin(), alice)


    });

    it('should not allow non-owner to do operation', async () => {

        await this.testToken.transferOwnership(this.timelock.address, {from: alice});
        await expectRevert(
            this.testToken.transferOwnership(carol, {from: alice}),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.testToken.transferOwnership(carol, {from: bob}),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.timelock.queueTransaction(
                this.testToken.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]),
                (await time.latest()).add(time.duration.days(4)),
                {from: alice},
            ),
            'Timelock::queueTransaction: Call must come from admin.',
        );
    });

    it('should do the timelock thing', async () => {
        await this.testToken.transferOwnership(this.timelock.address, {from: alice});
        const eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.testToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        await time.increase(time.duration.days(1));
        await expectRevert(
            this.timelock.executeTransaction(
                this.testToken.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]), eta, {from: bob},
            ),
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.testToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        assert.equal((await this.testToken.owner()).valueOf(), carol);
    });
    it('test cancelTransaction', async () => {
        assert.equal(await this.testToken.owner().valueOf(), alice);
        await this.testToken.transferOwnership(this.timelock.address, {from: alice});
        assert.equal(await this.testToken.owner().valueOf(), this.timelock.address);

        let eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.testToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        await time.increase(time.duration.days(4));

        eta = (await time.latest()).add(time.duration.days(4));

        await this.timelock.cancelTransaction(
            this.testToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        assert.equal(await this.testToken.owner().valueOf(), this.timelock.address);


    });
    it("test acceptAdmin", async () => {
        assert.equal(await this.timelock.pendingAdmin(), alice);
        await this.timelock.acceptAdmin();
        assert.equal(await this.timelock.pendingAdmin(), zeroAddress);


    });
    it("test setPendingAdmin", async () => {
        assert.equal(await this.timelock.pendingAdmin(), alice);

        let eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.timelock.address, '0', 'setPendingAdmin(address)',
            encodeParameters(['address'],
                [carol]), eta, {from: bob}
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.timelock.address, '0', 'setPendingAdmin(address)',
            encodeParameters(['uint256'],
                [carol]), eta, {from: bob}
        );
        // await this.timelock.setPendingAdmin(carol, {from: bob});
        assert.equal(await this.timelock.pendingAdmin(), carol);


    });


});
