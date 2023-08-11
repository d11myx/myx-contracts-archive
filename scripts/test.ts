import { ethers } from 'hardhat';
import {
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPairLiquidity,
    getRoleManager,
    getRouter,
    TradeType,
} from '../helpers';
import { MockPriceFeed } from '../types';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const pairLiquidity = await getPairLiquidity();
    const roleManager = await getRoleManager();

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

    await roleManager.addKeeper('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await roleManager.addPoolAdmin('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

    const btcFeedAddress = await oraclePriceFeed.priceFeeds('0x8A791620dd6260079BF849Dc5567aDC3F2FdC318');
    const ethFeedAddress = await oraclePriceFeed.priceFeeds('0x610178dA211FEF7D417bC0e6FeD39F05609AD788');

    const mockPriceFeedFactory = (await ethers.getContractFactory('MockPriceFeed')) as MockPriceFeed;

    const btcFeed = mockPriceFeedFactory.attach(btcFeedAddress);
    const ethFeed = mockPriceFeedFactory.attach(ethFeedAddress);

    await btcFeed.setAdmin('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', true);
    await ethFeed.setAdmin('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', true);

    console.log(await btcFeed.isAdmin('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'));
    console.log(await ethFeed.isAdmin('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'));

    const tokens = ['0x8a791620dd6260079bf849dc5567adc3f2fdc318', '0x610178da211fef7d417bc0e6fed39f05609ad788'];
    const prices = ['29896420000000000000000000000000000', '1862390000000000000000000000000000'];

    // await executor.setPricesAndExecuteMarketOrders(tokens, prices, 1691583375, 4, 0);
    // await executor.executeIncreaseOrder(1, TradeType.LIMIT);
    // console.log(await executor.increaseMarketOrderStartIndex());
    // console.log(await pairLiquidity.lpFairPrice(0));
    // await executor.updateMaxTimeDelay(60 * 10);
    //
    // console.log(await orderManager.increaseMarketOrders(1));

    // await executor.executeIncreaseOrder(2, TradeType.MARKET);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
