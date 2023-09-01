import { ethers } from 'hardhat';
import {
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRouter,
    TradeType,
} from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer, keeper] = await ethers.getSigners();

    // const addresses = await ethers.getSigners();
    // for (let address of addresses) {
    //     console.log(address.address);
    //     // console.log(await address.getBalance());
    // }

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const pool = await getPool();

    console.log(`router:`, router.address);
    // console.log(`index:`, await executor.increaseMarketOrderStartIndex());

    // console.log(await pool.getPair(0));
    // console.log(await pool.getPair(1));

    console.log(await orderManager.increaseMarketOrders(25));
    // console.log(await executor.executeIncreaseMarketOrders([{ orderId: 7, level: 0, commissionRatio: 0 }]));

    // console.log(await positionManager.getPosition('0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc', 0, true));

    // console.log(await orderManager.decreaseMarketOrders(9));
    //
    // console.log(await executor.connect(keeper).executeDecreaseOrder(9, TradeType.MARKET));

    // console.log(await orderManager.decreaseMarketOrdersIndex());
    // console.log(await executor.decreaseMarketOrderStartIndex());

    // console.log(await oraclePriceFeed.getPrice('0xB010E4aC01bD4410eA04bdD12d1CB39EA0857950'));
    // console.log(await oraclePriceFeed.getPrice('0x16C72f9b628Df203370b9e504a6815191a22F252'));
    // console.log(await oraclePriceFeed.getPrice('0xf20BadFC3D7b86C45a903f95F6c5E4668E421E9C'));
    // console.log(await orderManager.increaseLimitOrdersIndex());
    // console.log(await orderManager.increaseLimitOrders(4));
    // await executor.connect(deployer).executeIncreaseLimitOrders([4]);
    //
    // console.log(keeper.address);
    // console.log(await positionManager.addressExecutor());
    // await executor.connect(keeper).executeIncreaseMarketOrders(1);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
