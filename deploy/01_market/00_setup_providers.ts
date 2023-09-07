import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ADDRESSES_PROVIDER_ID, COMMON_DEPLOY_PARAMS, ROLE_MANAGER_ID, waitForTx } from '../../helpers';
import { AddressesProvider, RoleManager } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, poolAdmin, operator, treasurer, keeper } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    // AddressesProvider
    const timelockArtifact = await deploy(ADDRESSES_PROVIDER_ID, {
        from: deployer,
        contract: 'Timelock',
        args: [deployerSigner.address, '10', '100'],
        ...COMMON_DEPLOY_PARAMS,
    });

    const timelock = (await hre.ethers.getContractAt(
        timelockArtifact.abi,
        timelockArtifact.address,
    )) as AddressesProvider;

    // AddressesProvider
    const addressesProviderArtifact = await deploy(ADDRESSES_PROVIDER_ID, {
        from: deployer,
        contract: 'AddressesProvider',
        args: [timelock.address],
        ...COMMON_DEPLOY_PARAMS,
    });

    const addressesProvider = (await hre.ethers.getContractAt(
        addressesProviderArtifact.abi,
        addressesProviderArtifact.address,
    )) as AddressesProvider;

    // RoleManager
    const roleManagerArtifact = await deploy(ROLE_MANAGER_ID, {
        from: deployer,
        contract: 'RoleManager',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });

    const roleManager = (await hre.ethers.getContractAt(
        roleManagerArtifact.abi,
        roleManagerArtifact.address,
    )) as RoleManager;

    // Setup RoleManager at AddressesProvider
    await waitForTx(await addressesProvider.setRolManager(roleManager.address));

    // Add PoolAdmin to RoleManager contract
    await waitForTx(await roleManager.connect(deployerSigner).addPoolAdmin(poolAdmin));
    await waitForTx(await roleManager.connect(deployerSigner).addOperator(operator));
    await waitForTx(await roleManager.connect(deployerSigner).addTreasurer(treasurer));
    await waitForTx(await roleManager.connect(deployerSigner).addKeeper(keeper));
};
func.id = `Providers`;
func.tags = ['market', 'provider'];
export default func;
