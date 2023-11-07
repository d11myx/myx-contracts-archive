import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    EXECUTION_LOGIC_ID,
    EXECUTOR_ID,
    FEE_COLLECTOR_ID,
    getAddressesProvider,
    getExecutionLogic,
    getExecutor,
    getFeeCollector,
    getFundingRate,
    getIndexPriceFeed,
    getLiquidationLogic,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRiskReserve,
    getRouter,
    getToken,
    LIQUIDATION_LOGIC_ID,
    loadReserveConfig,
    MARKET_NAME,
    ORDER_MANAGER_ID,
    POSITION_MANAGER_ID,
    RISK_RESERVE_ID,
    ROUTER_ID,
    waitForTx,
} from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, poolAdmin, dao } = await getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);
    const deployerSigner = await hre.ethers.getSigner(deployer);

    const reserveConfig = loadReserveConfig(MARKET_NAME);

    const addressProvider = await getAddressesProvider();
    const pool = await getPool();
    let usdt = await getToken();

    // FeeCollector
    await deploy(`${FEE_COLLECTOR_ID}`, {
        from: deployer,
        contract: 'FeeCollector',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address, pool.address, usdt.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
    const feeCollector = await getFeeCollector();

    // RiskReserve
    await deploy(`${RISK_RESERVE_ID}`, {
        from: deployer,
        contract: 'RiskReserve',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [dao, addressProvider.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
    const riskReserve = await getRiskReserve();

    // PositionManager
    await deploy(`${POSITION_MANAGER_ID}`, {
        from: deployer,
        contract: 'PositionManager',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address, pool.address, usdt.address, feeCollector.address, riskReserve.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
    const positionManager = await getPositionManager();

    // OrderManager
    await deploy(`${ORDER_MANAGER_ID}`, {
        from: deployer,
        contract: 'OrderManager',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressProvider.address, pool.address, positionManager.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
    const orderManager = await getOrderManager();

    // Router
    await deploy(`${ROUTER_ID}`, {
        from: deployer,
        contract: 'Router',
        args: [addressProvider.address, orderManager.address, positionManager.address, pool.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const router = await getRouter();

    // ExecutionLogic
    await deploy(`${EXECUTION_LOGIC_ID}`, {
        from: deployer,
        contract: 'ExecutionLogic',
        args: [
            addressProvider.address,
            pool.address,
            orderManager.address,
            positionManager.address,
            feeCollector.address,
            reserveConfig?.ExecuteOrderTimeDelay,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executionLogic = await getExecutionLogic();

    // LiquidationLogic
    await deploy(`${LIQUIDATION_LOGIC_ID}`, {
        from: deployer,
        contract: 'LiquidationLogic',
        args: [
            addressProvider.address,
            pool.address,
            orderManager.address,
            positionManager.address,
            feeCollector.address,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const liquidationLogic = await getLiquidationLogic();

    let oraclePriceFeed = await getOraclePriceFeed();
    let indexPriceFeed = await getIndexPriceFeed();
    let fundingRate = await getFundingRate();
    await waitForTx(
        await addressProvider
            .connect(deployerSigner)
            .initialize(
                oraclePriceFeed.address,
                indexPriceFeed.address,
                fundingRate.address,
                executionLogic.address,
                liquidationLogic.address,
            ),
    );

    // Executor
    await deploy(`${EXECUTOR_ID}`, {
        from: deployer,
        contract: 'Executor',
        args: [addressProvider.address],

        ...COMMON_DEPLOY_PARAMS,
    });
    const executor = await getExecutor();

    await waitForTx(await pool.connect(poolAdminSigner).setRiskReserve(riskReserve.address));
    await waitForTx(await pool.connect(poolAdminSigner).setFeeCollector(feeCollector.address));
    await waitForTx(await pool.connect(poolAdminSigner).setPositionManager(positionManager.address));
    await waitForTx(await pool.connect(poolAdminSigner).setOrderManager(orderManager.address));

    await waitForTx(await feeCollector.connect(poolAdminSigner).updatePositionManagerAddress(positionManager.address));

    await waitForTx(await riskReserve.connect(poolAdminSigner).updatePositionManagerAddress(positionManager.address));
    await waitForTx(await riskReserve.connect(poolAdminSigner).updatePoolAddress(pool.address));

    await waitForTx(await orderManager.connect(poolAdminSigner).setRouter(router.address));
    await waitForTx(await executionLogic.connect(poolAdminSigner).updateExecutor(executor.address));
    await waitForTx(await liquidationLogic.connect(poolAdminSigner).updateExecutor(executor.address));
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
