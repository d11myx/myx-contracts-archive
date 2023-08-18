import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getAddressesProvider,
    getOraclePriceFeed,
    getWETH,
    PAIR_INFO_ID,
    PAIR_LIQUIDITY_ID,
    POOL_TOKEN_FACTORY,
} from '../../helpers';
import { Pool, PoolTokenFactory } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, feeReceiver, slipReceiver } = await getNamedAccounts();

    const addressProvider = await getAddressesProvider();
    const oraclePriceFeed = await getOraclePriceFeed();
    const weth = await getWETH();

    // PoolTokenFactory

    const poolTokenFactoryArtifact = await deploy(`${POOL_TOKEN_FACTORY}`, {
        from: deployer,
        contract: 'PoolTokenFactory',
        args: [addressProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const poolTokenFactory = (await hre.ethers.getContractAt(
        poolTokenFactoryArtifact.abi,
        poolTokenFactoryArtifact.address,
    )) as PoolTokenFactory;
    // Pool
    const pairInfoArtifact = await deploy(`${PAIR_INFO_ID}`, {
        from: deployer,
        contract: 'Pool',
        args: [addressProvider.address, poolTokenFactory.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pool = (await hre.ethers.getContractAt(pairInfoArtifact.abi, pairInfoArtifact.address)) as Pool;
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
