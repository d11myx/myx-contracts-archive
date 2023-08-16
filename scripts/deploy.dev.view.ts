import { ethers } from 'hardhat';
import { getExecutor, getOraclePriceFeed, getOrderManager, getPool, getPositionManager, getRouter } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer, keeper] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const pool = await getPool();

    console.log(`router:`, router.address);
    console.log(`index:`, await executor.increaseMarketOrderStartIndex());

    const allDeployments = await hre.deployments.get();
    // console.log(await pool.getPair(0));
    // console.log(await pool.getPair(1));

    // console.log(await orderManager.increaseMarketOrdersIndex());
    // console.log(await orderManager.increaseMarketOrders(0));
    //
    // console.log(keeper.address);
    // console.log(await positionManager.addressExecutor());
    // await executor.connect(keeper).executeIncreaseMarketOrders(1);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
