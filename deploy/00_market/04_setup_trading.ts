import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    EXECUTOR_ID,
    getAddressesProvider,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getPool,
    getRoleManager,
    getWETH,
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
    const pool = await getPool();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();

    // PositionManager
    const positionManagerArtifact = await deploy(`${TRADING_VAULT_ID}`, {
        from: deployer,
        contract: 'PositionManager',
        args: [addressProvider.address, pool.address, 8 * 60 * 60],
        ...COMMON_DEPLOY_PARAMS,
    });
    const positionManager = (await hre.ethers.getContractAt(
        positionManagerArtifact.abi,
        positionManagerArtifact.address,
    )) as PositionManager;

    // OrderManager
    const orderManagerArtifact = await deploy(`${ORDER_MANAGER_ID}`, {
        from: deployer,
        contract: 'OrderManager',
        args: [addressProvider.address, pool.address, positionManager.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const orderManager = (await hre.ethers.getContractAt(
        orderManagerArtifact.abi,
        orderManagerArtifact.address,
    )) as OrderManager;

    const weth = await getWETH();
    // Router
    const routerArtifact = await deploy(`${ROUTER_ID}`, {
        from: deployer,
        contract: 'Router',
        args: [weth.address, addressProvider.address, orderManager.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const router = (await hre.ethers.getContractAt(routerArtifact.abi, routerArtifact.address)) as Router;
    await orderManager.setRouter(router.address);

    // Executor
    const executorArtifact = await deploy(`${EXECUTOR_ID}`, {
        from: deployer,
        contract: 'Executor',
        args: [addressProvider.address, pool.address, orderManager.address, positionManager.address, 60],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executor = (await hre.ethers.getContractAt(executorArtifact.abi, executorArtifact.address)) as Executor;

    await waitForTx(await orderManager.connect(poolAdminSigner).updatePositionManager(positionManager.address));

    const roleManager = await getRoleManager();
    await waitForTx(await roleManager.connect(deployerSigner).addKeeper(executor.address));

    await positionManager.setExecutor(executor.address);
    await positionManager.setOrderManager(orderManager.address);
    await orderManager.setExecutor(executor.address);

    await pool.setTradingVault(positionManager.address);
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
