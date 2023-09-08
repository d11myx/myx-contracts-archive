import { ethers } from 'hardhat';
import {
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRoleManager,
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
    const roleManager = await getRoleManager();
    const pool = await getPool();
    // console.log(`router:`, router.address);
    // console.log(`index:`, await orderManager.ordersIndex());
    console.log(`executor:`, executor.address);

    const { usdt, btc, eth } = await getTokens();
    console.log(`btc price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30));
    console.log(`eth price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30));

    const btcFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
    const ethFeedAddress = await oraclePriceFeed.priceFeeds(eth.address);
    const mockPriceFeedFactory = (await ethers.getContractFactory('MockPriceFeed')) as MockPriceFeed;

    const keepers: string[] = [
        // '0xA85583325A974bE1B47a492589Ce4370a6C20628',
        // '0x90A6E957421e4da018d4d42358777282d5B58f0D',
        // '0xf3ca5d7ffe335d97323A6579D9a82f94134b9d4b',
        // '0xCB46beC2C4B768299F5eB2d03042AeF70095f83e',
        // '0xc13403910d21901661C200eafa7076de0711d3Fb',
        // '0x715f29B6b150Db476cf5a8b5667C1bc2f6025fA4',
        // '0xBA0886b286374BCC8754699775c05fe86b165705',
        // '0x1C7780946c47cCEd4AC394f59b984E983b3576a3',
        // '0x9F02805250713C534EA2B76B537c714B6959b8CB',
        // '0xd4c55C8625c1D0AC0f69A790C15ad2c01dC7a50f',
        // '0xED8697599638fF3192492AAc02f8CCCd7E5F1834',
        '0xB7ba707A62D73C5823879FdC2B1D1CDfb484B48A',
        '0x97f00086093674dde1B4e6B1c1866aE6fDEeF19E',
    ];

    for (let keeper of keepers) {
        // await deployer.sendTransaction({ to: keeper, value: ethers.utils.parseEther('100') });

        await waitForTx(await roleManager.addKeeper(keeper));
        await waitForTx(await roleManager.addPoolAdmin(keeper));

        const btcFeed = mockPriceFeedFactory.attach(btcFeedAddress);
        const ethFeed = mockPriceFeedFactory.attach(ethFeedAddress);

        await waitForTx(await btcFeed.setAdmin(keeper, true));
        await waitForTx(await ethFeed.setAdmin(keeper, true));

        console.log(await btcFeed.isAdmin(keeper));
        console.log(await ethFeed.isAdmin(keeper));
    }

    // await positionManager.updateFundingInterval(60 * 60);

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
