import { ethers } from "hardhat";
import { PairVault, PairInfo } from "../typechain-types/";
import { expect } from "./shared/expect";
import { Decimal } from "decimal.js";

const {
    BigNumber,
    constants: { MaxUint256 },
} = ethers;
const Q128 = BigNumber.from(2).pow(128);

Decimal.config({ toExpNeg: -500, toExpPos: 500 });

describe("pair vault", () => {
    let pairVault: PairVault;
    let pairInfo: PairInfo;
    before("deploy FullMathTest", async () => {
        const PairVaultContract = await ethers.getContractFactory("PairVault");
        pairVault = (await PairVaultContract.deploy()) as PairVault;
        const ParirInfoContract = await ethers.getContractFactory("PairInfo");
        pairInfo = (await ParirInfoContract.deploy()) as PairInfo;
        await pairVault.initialize(pairInfo.address);
    });

    describe("pair info", () => {
        it("test pair info", async () => {
            expect(await pairVault.pairInfo()).to.be.eq(pairInfo.address);
        });
    });
});
