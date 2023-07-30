import { expect } from 'chai';
import { constants } from 'ethers';
import { AddressesProvider, RoleManager } from '../types';
import { setupTestEnv, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { deployContract } from '../helpers/utilities/tx';

describe('Access Control List Manager', () => {
    let roleManager: RoleManager;

    // const OPERATOR_ROLE = utils.keccak256(utils.formatBytes32String('OPERATOR_ROLE'));
    // const KEEPER_ROLE = utils.keccak256(utils.formatBytes32String('KEEPER_ROLE'));

    beforeEach(async () => {
        await setupTestEnv();
        const { deployer, keeper } = testEnv;
        const addressesProvider = (await deployContract('AddressesProvider', [])) as AddressesProvider;
        roleManager = (await deployContract('RoleManager', [addressesProvider.address])) as RoleManager;
        await addressesProvider.setRolManager(roleManager.address);

        // await roleManager.addPoolAdmin(deployer.address);
        // await roleManager.addKeeper(keeper.address);
    });

    it('Check DEFAULT_ADMIN_ROLE', async () => {
        const { deployer, users } = testEnv;

        await roleManager.addPoolAdmin(deployer.address);
        const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;
        expect(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.eq(true);
        expect(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, users[0].address)).to.be.eq(false);
    });

    it('Grant OPERATOR_ROLE role', async () => {
        const {
            deployer,
            users: [keeper1],
        } = testEnv;
        let OPERATOR_ROLE = await roleManager.OPERATOR_ROLE();
        expect(await roleManager.hasRole(OPERATOR_ROLE, keeper1.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).grantRole(OPERATOR_ROLE, keeper1.address);
        expect(await roleManager.hasRole(OPERATOR_ROLE, keeper1.address)).to.be.eq(true);
    });

    it('KEEPER_ROLE grant KEEPER_ROLE (revert expected)', async () => {
        const {
            users: [keeper1, keeper2],
        } = testEnv;
        let KEEPER_ROLE = await roleManager.KEEPER_ROLE();

        console.log('KEEPER_ROLE:' + KEEPER_ROLE);
        let keeperRole = await roleManager.KEEPER_ROLE();
        await roleManager.addKeeper(keeper1.address);
        expect(await roleManager.isKeeper(keeper2.address)).to.be.eq(false);
        expect(await roleManager.isKeeper(keeper1.address)).to.be.eq(true);
        expect(await roleManager.hasRole(keeperRole, keeper1.address)).to.be.eq(true);

        await expect(roleManager.connect(keeper1.signer).addKeeper(keeper2.address)).to.be.revertedWith(
            `AccessControl: account ${keeper1.address.toLowerCase()} is missing role ${constants.HashZero}`,
        );

        expect(await roleManager.isKeeper(keeper2.address)).to.be.eq(false);
        expect(await roleManager.hasRole(keeperRole, keeper1.address)).to.be.eq(true);
    });

    it('Make OPERATOR_ROLE admin of FLASH_BORROWER_ROLE', async () => {
        const { deployer } = testEnv;
        const OPERATOR_ROLE = await roleManager.OPERATOR_ROLE();
        expect(await roleManager.getRoleAdmin(OPERATOR_ROLE)).to.not.be.eq(OPERATOR_ROLE);
        await roleManager.connect(deployer.signer).setRoleAdmin(OPERATOR_ROLE, OPERATOR_ROLE);
        expect(await roleManager.getRoleAdmin(OPERATOR_ROLE)).to.be.eq(OPERATOR_ROLE);
    });

    it('Treasurer', async () => {
        const {
            deployer,
            users: [keeper1, keeper2],
        } = testEnv;

        let TREASURER_ROLE = await roleManager.TREASURER_ROLE();

        await roleManager.addTreasurer(keeper1.address);
        expect(await roleManager.isTreasurer(keeper2.address)).to.be.eq(false);
        expect(await roleManager.hasRole(TREASURER_ROLE, keeper1.address)).to.be.eq(true);
        await roleManager.setRoleAdmin(TREASURER_ROLE, ethers.constants.HashZero);
        // await roleManager.connect(keeper1.signer).addTreasurer(keeper2.address);

        // expect(await roleManager.isTreasurer(keeper2.address)).to.be.eq(true);
        // expect(await roleManager.hasRole(TREASURER_ROLE, keeper1.address)).to.be.eq(true);
    });

    it('DEFAULT_ADMIN tries to revoke OPERATOR_ROLE (revert expected)', async () => {
        const {
            deployer,
            users: [keeper1, keeper2],
        } = testEnv;

        let OPERATOR_ROLE = roleManager.OPERATOR_ROLE();
        await roleManager.addOperator(keeper2.address);
        await roleManager.addOperator(keeper1.address);
        expect(await roleManager.isOperator(keeper2.address)).to.be.eq(true);
        expect(await roleManager.hasRole(OPERATOR_ROLE, keeper1.address)).to.be.eq(true);

        await expect(roleManager.connect(keeper2.signer).removeOperator(keeper2.address)).to.be.revertedWith(
            `AccessControl: account ${keeper2.address.toLowerCase()} is missing role ${ethers.constants.HashZero}`,
        );

        // expect(await roleManager.addOperator(keeper2.address)).to.be.eq(true);
        expect(await roleManager.hasRole(OPERATOR_ROLE, keeper1.address)).to.be.eq(true);
    });

    it('Grant POOL_ADMIN role', async () => {
        const {
            deployer,
            users: [, poolAdmin],
        } = testEnv;

        expect(await roleManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).addPoolAdmin(poolAdmin.address);
        expect(await roleManager.isPoolAdmin(poolAdmin.address)).to.be.eq(true);
        await roleManager.removePoolAdmin(poolAdmin.address);
        expect(await roleManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);
    });

    it('Grant Operator role', async () => {
        const {
            deployer,
            users: [, , emergencyAdmin],
        } = testEnv;

        expect(await roleManager.isOperator(emergencyAdmin.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).addOperator(emergencyAdmin.address);
        expect(await roleManager.isOperator(emergencyAdmin.address)).to.be.eq(true);
        await roleManager.connect(deployer.signer).removeOperator(emergencyAdmin.address);
        expect(await roleManager.isOperator(emergencyAdmin.address)).to.be.eq(false);
    });

    it('Grant BRIDGE role', async () => {
        const {
            deployer,
            users: [, , , bridge],
        } = testEnv;

        expect(await roleManager.isTreasurer(bridge.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).addTreasurer(bridge.address);
        expect(await roleManager.isTreasurer(bridge.address)).to.be.eq(true);
        await roleManager.connect(deployer.signer).removeTreasurer(bridge.address);
        expect(await roleManager.isTreasurer(bridge.address)).to.be.eq(false);
    });

    it('Grant RISK_ADMIN role', async () => {
        const {
            deployer,
            users: [, , , , riskAdmin],
        } = testEnv;

        expect(await roleManager.isKeeper(riskAdmin.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).addKeeper(riskAdmin.address);
        expect(await roleManager.isKeeper(riskAdmin.address)).to.be.eq(true);
        await roleManager.connect(deployer.signer).removeKeeper(riskAdmin.address);
        expect(await roleManager.isKeeper(riskAdmin.address)).to.be.eq(false);
    });

    it('Grant ASSET_LISTING_ADMIN role', async () => {
        const {
            deployer,
            users: [, , , , , assetListingAdmin],
        } = testEnv;

        expect(await roleManager.isAdmin(assetListingAdmin.address)).to.be.eq(false);
        await roleManager.connect(deployer.signer).addAdmin(assetListingAdmin.address);
        expect(await roleManager.isAdmin(assetListingAdmin.address)).to.be.eq(true);
        await roleManager.connect(deployer.signer).removeAdmin(assetListingAdmin.address);
        expect(await roleManager.isAdmin(assetListingAdmin.address)).to.be.eq(false);
    });

    it('Tries to deploy  is ZERO_ADDRESS (revert expected)', async () => {
        const { deployer, addressesProvider } = testEnv;

        await expect(addressesProvider.setRolManager(ethers.constants.AddressZero)).to.be.revertedWith('is 0');
    });
});
