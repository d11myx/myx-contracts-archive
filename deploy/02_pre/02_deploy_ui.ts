import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS, getAddressesProvider } from '../../helpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    const addressesProvider = await getAddressesProvider();

    await deploy(`UiPoolDataProvider`, {
        from: deployer,
        contract: 'UiPoolDataProvider',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });

    await deploy(`UiPositionDataProvider`, {
        from: deployer,
        contract: 'UiPositionDataProvider',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
};

func.id = `DeployUI`;
func.tags = ['pre', 'deploy-ui'];
export default func;
