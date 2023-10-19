import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    ADDRESSES_PROVIDER_ID,
    COMMON_DEPLOY_PARAMS,
    ROLE_MANAGER_ID,
    TIMELOCK_ID,
    getWETH,
    waitForTx,
    getTimelock,
    getAddressesProvider,
    getRoleManager,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, poolAdmin, operator, treasurer, keeper } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    const weth = await getWETH();

    // Timelock
    await deploy(TIMELOCK_ID, {
        from: deployer,
        contract: 'Timelock',
        args: ['43200'],
        ...COMMON_DEPLOY_PARAMS,
    });
    const timelock = await getTimelock();

    // AddressesProvider
    await deploy(ADDRESSES_PROVIDER_ID, {
        from: deployer,
        contract: 'AddressesProvider',
        args: [weth.address, timelock.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const addressesProvider = await getAddressesProvider();

    // RoleManager
    await deploy(ROLE_MANAGER_ID, {
        from: deployer,
        contract: 'RoleManager',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const roleManager = await getRoleManager();

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
