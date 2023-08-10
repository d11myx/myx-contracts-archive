import { ethers } from 'hardhat';
import { getExecutor, getOraclePriceFeed, getOrderManager, getRouter, TradeType } from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();

    console.log(`router:`, router.address);
    console.log(`index:`, await orderManager.increaseMarketOrdersIndex());

    console.log(`executor:`, executor.address);
    console.log(
        `btc price:`,
        ethers.utils.formatUnits(await oraclePriceFeed.getPrice('0x8A791620dd6260079BF849Dc5567aDC3F2FdC318'), 30),
    );
    console.log(
        `eth price:`,
        ethers.utils.formatUnits(await oraclePriceFeed.getPrice('0x610178dA211FEF7D417bC0e6FeD39F05609AD788'), 30),
    );

    const tokens = ['0x8a791620dd6260079bf849dc5567adc3f2fdc318', '0x610178da211fef7d417bc0e6fed39f05609ad788'];
    const prices = ['29896420000000000000000000000000000', '1862390000000000000000000000000000'];

    // await executor.setPricesAndExecuteMarketOrders(tokens, prices, 1691583375, 4, 0);
    await executor.executeIncreaseOrder(4, TradeType.MARKET);
    // await executor.updateMaxTimeDelay(60 * 10);
    //
    // console.log(await orderManager.increaseMarketOrders(1));

    // await executor.executeIncreaseOrder(2, TradeType.MARKET);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
