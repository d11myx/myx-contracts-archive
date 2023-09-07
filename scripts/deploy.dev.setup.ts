import { ethers } from 'hardhat';
import {
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    roleManager,
    getRouter,
    getTestCallBack,
    getToken,
    MAX_UINT_AMOUNT,
    MOCK_TOKEN_PREFIX,
    SymbolMap,
    waitForTx,
} from '../helpers';
import { IPool, MockPriceFeed, Token } from '../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const roleManager = await roleManager();
    const pool = await getPool();
    const testCallBack = await getTestCallBack();

    console.log(`router:`, router.address);
    // console.log(`index:`, await orderManager.ordersIndex());

    const { usdt, btc, eth } = await getTokens();
    const keeper = '0x66D1e5F498c21709dCFC916785f09Dcf2D663E63';

    console.log(`executor:`, executor.address);
    console.log(`btc price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30));
    console.log(`eth price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30));

    await waitForTx(await roleManager.connect(deployer).addKeeper(keeper));
    await waitForTx(await roleManager.connect(deployer).addPoolAdmin(keeper));

    const btcFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
    const ethFeedAddress = await oraclePriceFeed.priceFeeds(eth.address);

    const mockPriceFeedFactory = (await ethers.getContractFactory('MockPriceFeed')) as MockPriceFeed;

    const btcFeed = mockPriceFeedFactory.attach(btcFeedAddress);
    const ethFeed = mockPriceFeedFactory.attach(ethFeedAddress);

    await waitForTx(await btcFeed.setAdmin(keeper, true));
    await waitForTx(await ethFeed.setAdmin(keeper, true));

    console.log(await btcFeed.isAdmin(keeper));
    console.log(await ethFeed.isAdmin(keeper));

    await positionManager.updateFundingInterval(10 * 60);

    console.log(`testCallBack:`, testCallBack.address);

    // await waitForTx(await usdt.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await btc.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await eth.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await usdt.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await btc.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await eth.approve(testCallBack.address, MAX_UINT_AMOUNT));
    //
    // await waitForTx(
    //     await testCallBack.addLiquidity(
    //         pool.address,
    //         (
    //         await pool.getPair(0)
    //         ).indexToken,
    //         (
    //         await pool.getPair(0)
    //         ).stableToken,
    //         ethers.utils.parseEther('1000'),
    //         ethers.utils.parseEther('26000000'),
    //     ),
    // );
    // await waitForTx(
    //     await testCallBack.addLiquidity(
    //         pool.address,
    //         (
    //         await pool.getPair(1)
    //         ).indexToken,
    //         (
    //         await pool.getPair(1)
    //         ).stableToken,
    //         ethers.utils.parseEther('1000'),
    //         ethers.utils.parseEther('1650000'),
    //     ),
    // );

    // const btcTradingConfig: IPool.TradingConfigStruct = {
    //     minLeverage: 3,
    //     maxLeverage: 50,
    //     minTradeAmount: '100000000000000000',
    //     maxTradeAmount: '100000000000000000000000',
    //     maxPositionAmount: '100000000000000000000000000',
    //     maintainMarginRate: 100,
    //     priceSlipP: 10,
    //     maxPriceDeviationP: 50,
    // };
    // await pool.updateTradingConfig(0, btcTradingConfig);
    //
    // const ethTradingConfig: IPool.TradingConfigStruct = {
    //     minLeverage: 3,
    //     maxLeverage: 50,
    //     minTradeAmount: '100000000000000000',
    //     maxTradeAmount: '100000000000000000000000',
    //     maxPositionAmount: '100000000000000000000000000',
    //     maintainMarginRate: 100,
    //     priceSlipP: 10,
    //     maxPriceDeviationP: 50,
    // };
    // await pool.updateTradingConfig(1, ethTradingConfig);
}

async function getTokens() {
    const allDeployments = await hre.deployments.all();
    const mockTokenKeys = Object.keys(allDeployments).filter((key) => key.includes(MOCK_TOKEN_PREFIX));

    let pairTokens: SymbolMap<Token> = {};
    for (let [key, deployment] of Object.entries(allDeployments)) {
        if (mockTokenKeys.includes(key)) {
            pairTokens[key.replace(MOCK_TOKEN_PREFIX, '')] = await getToken(deployment.address);
        }
    }

    // tokens
    const usdt = await getToken();
    const btc = pairTokens['BTC'];
    const eth = pairTokens['ETH'];

    return { usdt, btc, eth };
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
