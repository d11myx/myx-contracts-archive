import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getOraclePriceFeed,
    getWETH,
    PAIR_INFO_ID,
    PAIR_LIQUIDITY_ID,
    PAIR_VAULT_ID,
    waitForTx,
} from '../../helpers';
import { PairInfo, PairLiquidity, PairVault } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, feeReceiver, slipReceiver } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    // PairInfo
    const pairInfoArtifact = await deploy(`${PAIR_INFO_ID}`, {
        from: deployer,
        contract: 'PairInfo',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairInfo = (await hre.ethers.getContractAt(pairInfoArtifact.abi, pairInfoArtifact.address)) as PairInfo;

    await pairInfo.initialize();

    // PairVault
    const pairVaultArtifact = await deploy(`${PAIR_VAULT_ID}`, {
        from: deployer,
        contract: 'PairVault',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairVault = (await hre.ethers.getContractAt(pairVaultArtifact.abi, pairVaultArtifact.address)) as PairVault;

    await pairVault.connect(deployerSigner).initialize(pairInfo.address);

    // PairLiquidity
    const pairLiquidityArtifact = await deploy(`${PAIR_LIQUIDITY_ID}`, {
        from: deployer,
        contract: 'PairLiquidity',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const pairLiquidity = (await hre.ethers.getContractAt(
        pairLiquidityArtifact.abi,
        pairLiquidityArtifact.address,
    )) as PairLiquidity;

    const oraclePriceFeed = await getOraclePriceFeed();
    const weth = await getWETH();
    await pairLiquidity.initialize(
        pairInfo.address,
        pairVault.address,
        oraclePriceFeed.address,
        feeReceiver,
        slipReceiver,
        weth.address,
    );

    await waitForTx(await pairLiquidity.setHandler(pairInfo.address, true));
    await waitForTx(await pairVault.setHandler(pairLiquidity.address, true));
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
