import {testEnv} from "./helpers/make-suite";
import {ethers} from "hardhat";
import {describe} from "mocha";

describe('PairInfo: Edge cases', () => {

    before('Deploy Pair', async () => {
        const {deployer} = testEnv;
        console.log(`deployer address:`, deployer.address);

        const pairInfoFactory = await ethers.getContractFactory('PairInfo', deployer.signer);
        const pairInfo = await pairInfoFactory.deploy();

        console.log(`pairInfo address:`, pairInfo.address);
    });

    it('check getters', async () => {

    });

    describe('test addPair', async () => {
        it('check pair info ', async () => {

        });
    });

    describe('test updatePair', async () => {
        it('check configs', async () => {

        });
    });
});