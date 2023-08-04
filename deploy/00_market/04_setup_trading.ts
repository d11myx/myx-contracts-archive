import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    EXECUTE_ROUTER_ID,
    EXECUTOR_ID,
    getAddressesProvider,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getPairInfo,
    getPairVault,
    getRoleManager,
    ORDER_MANAGER_ID,
    ROUTER_ID,
    TRADING_ROUTER_ID,
    TRADING_VAULT_ID,
    waitForTx,
} from '../../helpers';
import { ExecuteRouter, Router, Executor, TradingRouter, TradingVault, OrderManager } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, keeper, feeReceiver } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);
    // TradingVault
    const tradingVaultArtifact = await deploy(`${TRADING_VAULT_ID}`, {
        from: deployer,
        contract: 'TradingVault',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const tradingVault = (await hre.ethers.getContractAt(
        tradingVaultArtifact.abi,
        tradingVaultArtifact.address,
    )) as TradingVault;

    // TradingRouter
    const tradingRouterArtifact = await deploy(`${TRADING_ROUTER_ID}`, {
        from: deployer,
        contract: 'TradingRouter',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const tradingRouter = (await hre.ethers.getContractAt(
        tradingRouterArtifact.abi,
        tradingRouterArtifact.address,
    )) as TradingRouter;

    // ExecuteRouter
    const executeRouterArtifact = await deploy(`${EXECUTE_ROUTER_ID}`, {
        from: deployer,
        contract: 'ExecuteRouter',
        args: [],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executeRouter = (await hre.ethers.getContractAt(
        executeRouterArtifact.abi,
        executeRouterArtifact.address,
    )) as ExecuteRouter;

    const addressProvider = await getAddressesProvider();
    const pairInfo = await getPairInfo();
    const pairVault = await getPairVault();
    const oraclePriceFeed = await getOraclePriceFeed();
    // OrderManager
    const orderManagerArtifact = await deploy(`${ORDER_MANAGER_ID}`, {
        from: deployer,
        contract: 'OrderManager',
        args: [
            addressProvider.address,
            pairInfo.address,
            pairVault.address,
            tradingVault.address,
            tradingRouter.address,
            oraclePriceFeed.address,
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const orderManager = (await hre.ethers.getContractAt(
        orderManagerArtifact.abi,
        orderManagerArtifact.address,
    )) as OrderManager;

    // Router
    const routerArtifact = await deploy(`${ROUTER_ID}`, {
        from: deployer,
        contract: 'Router',
        args: [addressProvider.address, tradingRouter.address, orderManager.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const router = (await hre.ethers.getContractAt(routerArtifact.abi, routerArtifact.address)) as Router;

    // Executor
    const executorArtifact = await deploy(`${EXECUTOR_ID}`, {
        from: deployer,
        contract: 'Executor',
        args: [addressProvider.address, executeRouter.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const executor = (await hre.ethers.getContractAt(executorArtifact.abi, executorArtifact.address)) as Executor;

    // const pairInfo = await getPairInfo();
    // const pairVault = await getPairVault();

    const indexPriceFeed = await getIndexPriceFeed();

    await tradingVault.initialize(
        pairInfo.address,
        pairVault.address,
        oraclePriceFeed.address,
        feeReceiver,
        8 * 60 * 60,
    );

    await tradingRouter.initialize(pairInfo.address, pairVault.address, tradingVault.address, oraclePriceFeed.address);

    await executeRouter.initialize(
        pairInfo.address,
        pairVault.address,
        tradingVault.address,
        tradingRouter.address,
        oraclePriceFeed.address,
        indexPriceFeed.address,
        60,
    );

    const roleManager = await getRoleManager();
    await waitForTx(await roleManager.connect(deployerSigner).addContractWhiteList(router.address));

    await pairVault.setHandler(tradingVault.address, true);
    await tradingVault.setHandler(executeRouter.address, true);
    await tradingRouter.setHandler(executeRouter.address, true);
    await tradingRouter.setHandler(router.address, true);
    await tradingRouter.setHandler(orderManager.address, true);
    await executeRouter.setPositionKeeper(keeper, true);
    await executeRouter.setPositionKeeper(executor.address, true);
};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
