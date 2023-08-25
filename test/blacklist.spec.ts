import { testEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers, getNamedAccounts } from 'hardhat';

describe('Blacklist cases', () => {
    after(async () => {});

    it('operator can manage blacklist', async () => {
        const {
            roleManager,
            users: [blackUser],
        } = testEnv;

        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);
        expect(await roleManager.isOperator(operator)).to.be.eq(true);

        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(false);

        await roleManager.connect(operatorSigner).addAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(true);

        await roleManager.connect(operatorSigner).removeAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(false);
    });

    it('user manage blacklist should be reverted', async () => {
        const {
            deployer,
            roleManager,
            users: [blackUser],
        } = testEnv;

        expect(await roleManager.isOperator(deployer.address)).to.be.eq(false);

        await expect(roleManager.connect(deployer.signer).addAccountBlackList(blackUser.address)).to.be.reverted;
        await expect(roleManager.connect(deployer.signer).removeAccountBlackList(blackUser.address)).to.be.reverted;
    });
});
