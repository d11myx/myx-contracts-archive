import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS } from '../../helpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    await deploy(`MultipleTransfer`, {
        from: deployer,
        contract: 'MultipleTransfer',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
};

func.id = `DeployMultiple`;
func.tags = ['pre', 'deploy-multiple'];
export default func;
