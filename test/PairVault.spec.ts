import { ethers } from "hardhat";
import { PairVault } from "../typechain-types/PairVault";
import { expect } from "./shared/expect";
import { Decimal } from "decimal.js";

const {
    BigNumber,
    constants: { MaxUint256 },
} = ethers;
const Q128 = BigNumber.from(2).pow(128);

Decimal.config({ toExpNeg: -500, toExpPos: 500 });

describe("FullMath", () => {
    let pairVault: PairVault;
    before("deploy FullMathTest", async () => {
        const factory = await ethers.getContractFactory("FullMathTest");
        fullMath = (await factory.deploy()) as FullMathTest;
    });

    describe("#mulDiv", () => {
        it("reverts if denominator is 0", async () => {
            await expect(fullMath.mulDiv(Q128, 5, 0)).to.be.reverted;
        });
       
    });
});
