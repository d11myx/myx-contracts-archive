import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    console.log('=== Post deployment hook ===');

    await hre.run('print-deployments');
    console.log('=== Deploy Completed ===');
};

func.tags = ['after-deploy'];
func.runAtTheEnd = true;
export default func;
