import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getAddressesProvider,
    getOraclePriceFeed,
    getWETH,
    PAIR_INFO_ID,
    PAIR_LIQUIDITY_ID,
} from '../../helpers';
import { Pool } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, feeReceiver, slipReceiver } = await getNamedAccounts();

    const addressProvider = await getAddressesProvider();
    const oraclePriceFeed = await getOraclePriceFeed();
    const weth = await getWETH();

    // Pool
    const pairInfoArtifact = await deploy(`${PAIR_INFO_ID}`, {
        from: deployer,
        contract: 'Pool',
        args: [addressProvider.address, feeReceiver, slipReceiver],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairInfo = (await hre.ethers.getContractAt(pairInfoArtifact.abi, pairInfoArtifact.address)) as Pool;

    // PoolLiquidity
    // const pairLiquidityArtifact = await deploy(`${PAIR_LIQUIDITY_ID}`, {
    //     from: deployer,
    //     contract: 'PoolLiquidity',
    //     args: [
    //         addressProvider.address,
    //         pairInfo.address,
    //         feeReceiver,
    //         slipReceiver,
    //         // weth.address,
    //     ],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // const pairLiquidity = (await hre.ethers.getContractAt(
    //     pairLiquidityArtifact.abi,
    //     pairLiquidityArtifact.address,
    // )) as PoolLiquidity;
    await pairInfo.setPairLiquidityAndVault(pairInfo.address, pairInfo.address);
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
