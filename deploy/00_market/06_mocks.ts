import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getMockToken,
    getToken,
    loadReserveConfig,
    MARKET_NAME,
    TEST_CALLBACK_PREFIX,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    for (let pair of Object.keys(pairConfigs)) {
        const pairToken = await getMockToken(pair);
        const basicToken = await getToken();

        await deploy(`${TEST_CALLBACK_PREFIX}${pair}`, {
            from: deployer,
            contract: 'TestCallBack',
            args: [pairToken.address, basicToken.address],
            ...COMMON_DEPLOY_PARAMS,
        });
    }
};

func.id = `Mocks`;
func.tags = ['market', 'mocks'];
export default func;
