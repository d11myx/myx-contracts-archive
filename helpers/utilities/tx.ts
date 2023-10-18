import { Contract, ContractTransaction } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployProxyOptions } from '@openzeppelin/hardhat-upgrades/dist/utils';

declare var hre: HardhatRuntimeEnvironment;

export const waitForTx = async (tx: ContractTransaction) => await tx.wait(1);

export const deployContract = async <ContractType extends Contract>(
    contract: string,
    args?: any,
    libs?: { [libraryName: string]: string },
): Promise<ContractType> => {
    const [deployer] = await hre.ethers.getSigners();

    const contractFactory = await hre.ethers.getContractFactory(contract, {
        signer: deployer,
        libraries: {
            ...libs,
        },
    });

    const contractDeployed = await contractFactory.deploy(...args);

    return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const deployUpgradeableContract = async <ContractType extends Contract>(
    contract: string,
    args?: any[],
    opts?: DeployProxyOptions,
): Promise<ContractType> => {
    const [deployer] = await hre.ethers.getSigners();

    const contractFactory = await hre.ethers.getContractFactory(contract, deployer);
    let contractDeployed = await hre.upgrades.deployProxy(contractFactory, args, opts);
    await contractDeployed.deployed();
    return (await hre.ethers.getContractAt(contract, contractDeployed.address)) as any as ContractType;
};

export const getContract = async <ContractType extends Contract>(
    id: string,
    address?: string,
): Promise<ContractType> => {
    const artifact = await hre.deployments.getArtifact(id);
    return (await hre.ethers.getContractAt(
        artifact.abi,
        address || (await hre.deployments.get(id)).address,
    )) as any as ContractType;
};
