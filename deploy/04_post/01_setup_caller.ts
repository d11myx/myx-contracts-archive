import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    POSITION_CALLER,
    getPositionManager, getFeeCollector,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const positionManager = await getPositionManager();
    const feeCollector = await getFeeCollector();

    // PositionCaller
    await deploy(`${POSITION_CALLER}`, {
        from: deployer,
        contract: 'PositionCaller',
        args: [positionManager.address, feeCollector.address],
        ...COMMON_DEPLOY_PARAMS,
    });

};
func.id = `SetupPositionCaller`;
func.tags = ['post', 'setup-position-caller'];
export default func;
