import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getAddressesProvider,
    getOraclePriceFeed,
    getWETH,
    PAIR_INFO_ID,
    PAIR_LIQUIDITY_ID,
    PAIR_VAULT_ID,
} from '../../helpers';
import { PairInfo, PairLiquidity, PairVault } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, feeReceiver, slipReceiver } = await getNamedAccounts();

    const addressProvider = await getAddressesProvider();
    const oraclePriceFeed = await getOraclePriceFeed();
    const weth = await getWETH();

    // PairInfo
    const pairInfoArtifact = await deploy(`${PAIR_INFO_ID}`, {
        from: deployer,
        contract: 'PairInfo',
        args: [addressProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairInfo = (await hre.ethers.getContractAt(pairInfoArtifact.abi, pairInfoArtifact.address)) as PairInfo;

    // PairVault
    const pairVaultArtifact = await deploy(`${PAIR_VAULT_ID}`, {
        from: deployer,
        contract: 'PairVault',
        args: [addressProvider.address, pairInfo.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairVault = (await hre.ethers.getContractAt(pairVaultArtifact.abi, pairVaultArtifact.address)) as PairVault;

    // PairLiquidity
    const pairLiquidityArtifact = await deploy(`${PAIR_LIQUIDITY_ID}`, {
        from: deployer,
        contract: 'PairLiquidity',
        args: [
            addressProvider.address,
            pairInfo.address,
            pairVault.address,
            feeReceiver,
            slipReceiver,
            weth.address,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });

    const pairLiquidity = (await hre.ethers.getContractAt(
        pairLiquidityArtifact.abi,
        pairLiquidityArtifact.address,
    )) as PairLiquidity;
    await pairVault.setPairLiquidityAndVault(pairLiquidity.address, pairVault.address);
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
