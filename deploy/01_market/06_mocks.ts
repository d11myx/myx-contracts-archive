import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS, TEST_CALLBACK_ID } from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy(`${TEST_CALLBACK_ID}`, {
        from: deployer,
        contract: 'TestCallBack',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
};

func.id = `Mocks`;
func.tags = ['market', 'mocks'];
export default func;
