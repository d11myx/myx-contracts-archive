import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getAddressesProvider,
    getPoolTokenFactory,
    getPoolView,
    PAIR_INFO_ID,
    POOL_TOKEN_FACTORY,
    POOL_VIEW_ID,
    SPOT_SWAP,
    waitForTx,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const addressProvider = await getAddressesProvider();

    // PoolTokenFactory
    await deploy(`${POOL_TOKEN_FACTORY}`, {
        from: deployer,
        contract: 'PoolTokenFactory',
        args: [addressProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const poolTokenFactory = await getPoolTokenFactory();

    // spot swap
    await deploy(`${SPOT_SWAP}`, {
        from: deployer,
        contract: 'SpotSwap',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });

    // Pool
    await deploy(`${PAIR_INFO_ID}`, {
        from: deployer,
        contract: 'Pool',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address, poolTokenFactory.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });

    // PoolView
    await deploy(`${POOL_VIEW_ID}`, {
        from: deployer,
        contract: 'PoolView',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
};

func.id = `PoolDeploy`;
func.tags = ['market', 'pool-deploy'];
export default func;
