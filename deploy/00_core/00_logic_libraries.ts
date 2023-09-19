import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    // const { deploy } = deployments;
    // const { deployer } = await getNamedAccounts();

    // await deploy('LiquidationLogic', {
    //     from: deployer,
    //     args: [],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    return true;
};

func.id = 'LogicLibraries';
func.tags = ['core', 'logic'];

export default func;
