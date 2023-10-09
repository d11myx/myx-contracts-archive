import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { upgrades } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    deployProxy,
    EXECUTION_LOGIC_ID,
    EXECUTOR_ID,
    FEE_COLLECTOR_ID,
    getAddressesProvider,
    getPool,
    getRoleManager,
    getToken,
    getWETH,
    ORDER_MANAGER_ID,
    POSITION_MANAGER_ID,
    RISK_RESERVE_ID,
    ROUTER_ID,
    waitForTx,
} from '../../helpers';
import {
    Router,
    Executor,
    PositionManager,
    OrderManager,
    FeeCollector,
    ExecutionLogic,
    RiskReserve,
} from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, dao } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    const addressProvider = await getAddressesProvider();
    const pool = await getPool();
    let usdt = await getToken();

    // FeeCollector
    const feeCollectorArtifact = await deploy(`${FEE_COLLECTOR_ID}`, {
        from: deployer,
        contract: 'FeeCollector',
        args: [addressProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const feeCollector = (await hre.ethers.getContractAt(
        feeCollectorArtifact.abi,
        feeCollectorArtifact.address,
    )) as FeeCollector;

    // RiskReserve
    const riskReserveArtifact = await deploy(`${RISK_RESERVE_ID}`, {
        from: deployer,
        contract: 'RiskReserve',
        args: [dao, addressProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const riskReserve = (await hre.ethers.getContractAt(
        riskReserveArtifact.abi,
        riskReserveArtifact.address,
    )) as RiskReserve;

    // PositionManager
    // upgrades.deployProxy
    const positionManagerArtifact = await  deploy(`${POSITION_MANAGER_ID}`, {
        from: deployer,
        contract: 'PositionManager',
        args: [addressProvider.address, pool.address, usdt.address, feeCollector.address, riskReserve.address],
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
        // libraries: {
        //     ValidationHelper: validationHelperArtifact.address,
        // },
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
        args: [weth.address, addressProvider.address, orderManager.address, pool.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const router = (await hre.ethers.getContractAt(routerArtifact.abi, routerArtifact.address)) as Router;
    await waitForTx(await orderManager.setRouter(router.address));

    // ExecutionLogic
    const executionLogicArtifact = await deploy(`${EXECUTION_LOGIC_ID}`, {
        from: deployer,
        contract: 'ExecutionLogic',
        args: [
            addressProvider.address,
            pool.address,
            orderManager.address,
            positionManager.address,
            feeCollector.address,
            60 * 5, // todo testing
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executionLogic = (await hre.ethers.getContractAt(
        executionLogicArtifact.abi,
        executionLogicArtifact.address,
    )) as ExecutionLogic;

    // Executor
    const executorArtifact = await deployProxy(`${EXECUTOR_ID}`, {
        from: deployer,
        contract: 'Executor',
        args: [addressProvider.address, executionLogic.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executor = (await hre.ethers.getContractAt(executorArtifact.abi, executorArtifact.address)) as Executor;

    await waitForTx(await pool.setRiskReserve(riskReserve.address));

    await waitForTx(await executionLogic.updateExecutor(executor.address));

    await waitForTx(await riskReserve.updatePositionManagerAddress(positionManager.address));
    await waitForTx(await riskReserve.updatePoolAddress(pool.address));

    const roleManager = await getRoleManager();
    await waitForTx(await roleManager.connect(deployerSigner).addKeeper(executor.address));

    await waitForTx(await positionManager.setExecutor(executionLogic.address));
    await waitForTx(await positionManager.setOrderManager(executionLogic.address));
    await waitForTx(await orderManager.setExecutor(executionLogic.address));

    await waitForTx(await pool.addPositionManager(positionManager.address));
    await waitForTx(await pool.addOrderManager(orderManager.address));
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
