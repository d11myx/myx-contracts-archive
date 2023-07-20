import {HardhatRuntimeEnvironment} from "hardhat/types";
import {Signer} from "ethers";
import {getSigners} from "@nomiclabs/hardhat-ethers/internal/helpers";

declare var hre: HardhatRuntimeEnvironment;

export interface SignerWithAddress {
    signer: Signer;
    address: string;
}

export interface TestEnv {
    deployer: SignerWithAddress;
    users: SignerWithAddress[];
}

export const testEnv: TestEnv = {
    deployer: {} as SignerWithAddress,
    users: [] as SignerWithAddress[],
} as TestEnv;

export async function setupTestEnv() {
    const [_deployer, ...restSigners] = await getSigners(hre);
    const deployer: SignerWithAddress = {
        address: await _deployer.getAddress(),
        signer: _deployer,
    };

    for (const signer of restSigners) {
        testEnv.users.push({
            signer,
            address: await signer.getAddress(),
        });
    }
    testEnv.deployer = deployer;
}