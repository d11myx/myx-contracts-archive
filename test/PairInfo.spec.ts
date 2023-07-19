import { ethers } from "hardhat";
import { PairVault, PairInfo } from "../typechain-types/";
import { expect } from "./shared/expect";
import { Decimal } from "decimal.js";

describe("pair vault", () => {
    let pairInfo: PairInfo;
    before("deploy FullMathTest", async () => {
        const ParirInfoContract = await ethers.getContractFactory("PairInfo");
        pairInfo = (await ParirInfoContract.deploy()) as PairInfo;
    });
    describe("pair info", () => {
        it(" test pair info", () => {
            
        });
    });
});
