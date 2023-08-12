import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    EXECUTOR_ID,
    getAddressesProvider,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getPairInfo,
    getRoleManager,
    ORDER_MANAGER_ID,
    POSITION_MANAGER_ID,
    ROUTER_ID,
    TRADING_VAULT_ID,
    waitForTx,
} from '../../helpers';
import { Router, Executor, PositionManager, OrderManager } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, poolAdmin, feeReceiver } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const addressProvider = await getAddressesProvider();
    const pairInfo = await getPairInfo();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();

    // PositionManager
    const tradingVaultArtifact = await deploy(`${TRADING_VAULT_ID}`, {
        from: deployer,
        contract: 'PositionManager',
        args: [
            addressProvider.address,
            pairInfo.address,
            pairInfo.address,
            feeReceiver,
            8 * 60 * 60,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const tradingVault = (await hre.ethers.getContractAt(
        tradingVaultArtifact.abi,
        tradingVaultArtifact.address,
    )) as PositionManager;

    // OrderManager
    const orderManagerArtifact = await deploy(`${ORDER_MANAGER_ID}`, {
        from: deployer,
        contract: 'OrderManager',
        args: [
            addressProvider.address,
            pairInfo.address,
            pairInfo.address,
            tradingVault.address,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const orderManager = (await hre.ethers.getContractAt(
        orderManagerArtifact.abi,
        orderManagerArtifact.address,
    )) as OrderManager;

    // PositionManager
    // const positionManagerArtifact = await deploy(`${POSITION_MANAGER_ID}`, {
    //     from: deployer,
    //     contract: 'PositionManager',
    //     args: [
    //         addressProvider.address,
    //         pairInfo.address,
    //         pairVault.address,
    //         tradingVault.address,
    //         oraclePriceFeed.address,
    //         indexPriceFeed.address,
    //         orderManager.address,
    //     ],
    //     ...COMMON_DEPLOY_PARAMS,
    // });


    // Router
    const routerArtifact = await deploy(`${ROUTER_ID}`, {
        from: deployer,
        contract: 'Router',
        args: [addressProvider.address, orderManager.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const router = (await hre.ethers.getContractAt(routerArtifact.abi, routerArtifact.address)) as Router;
    await orderManager.setRouter(router.address);

    // Executor
    const executorArtifact = await deploy(`${EXECUTOR_ID}`, {
        from: deployer,
        contract: 'Executor',
        args: [
            addressProvider.address,
            pairInfo.address,
            pairInfo.address,
            orderManager.address,
            tradingVault.address,
            60,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executor = (await hre.ethers.getContractAt(executorArtifact.abi, executorArtifact.address)) as Executor;

    await waitForTx(await orderManager.connect(poolAdminSigner).updatePositionManager(tradingVault.address));

    const roleManager = await getRoleManager();
    await waitForTx(await roleManager.connect(deployerSigner).addKeeper(executor.address));

    await tradingVault.setExecutor(executor.address);
    await orderManager.setExecutor(executor.address);

    await pairInfo.setTradingVault(tradingVault.address);
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
