import { ethers } from 'hardhat';
import {
    deployMockCallback,
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getRoleManager,
    getRouter,
    getToken,
    MAX_UINT_AMOUNT,
    MOCK_TOKEN_PREFIX,
    SymbolMap,
    TradeType,
} from '../helpers';
import { MockPriceFeed, Token } from '../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const roleManager = await getRoleManager();
    const pool = await getPool();

    console.log(`router:`, router.address);
    console.log(`index:`, await orderManager.increaseMarketOrdersIndex());

    const { usdt, btc, eth } = await getTokens();
    const keeper = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    console.log(`executor:`, executor.address);
    console.log(`btc price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30));
    console.log(`eth price:`, ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30));

    await roleManager.addKeeper(keeper);
    await roleManager.addPoolAdmin(keeper);

    const btcFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
    const ethFeedAddress = await oraclePriceFeed.priceFeeds(eth.address);

    const mockPriceFeedFactory = (await ethers.getContractFactory('MockPriceFeed')) as MockPriceFeed;

    const btcFeed = mockPriceFeedFactory.attach(btcFeedAddress);
    const ethFeed = mockPriceFeedFactory.attach(ethFeedAddress);

    await btcFeed.setAdmin(keeper, true);
    await ethFeed.setAdmin(keeper, true);

    console.log(await btcFeed.isAdmin(keeper));
    console.log(await ethFeed.isAdmin(keeper));

    let testBtcCallBack = await deployMockCallback(btc.address, usdt.address);
    let testEthCallBack = await deployMockCallback(eth.address, usdt.address);
    console.log(`testBtcCallBack:`, testBtcCallBack.address);
    console.log(`testEthCallBack:`, testEthCallBack.address);

    await usdt.approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await btc.approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await eth.approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await usdt.approve(testEthCallBack.address, MAX_UINT_AMOUNT);
    await btc.approve(testEthCallBack.address, MAX_UINT_AMOUNT);
    await eth.approve(testEthCallBack.address, MAX_UINT_AMOUNT);

    await testBtcCallBack.addLiquidity(
        pool.address,
        0,
        ethers.utils.parseEther('1000'),
        ethers.utils.parseEther('30000000'),
    );
    await testEthCallBack.addLiquidity(
        pool.address,
        1,
        ethers.utils.parseEther('1000'),
        ethers.utils.parseEther('2000000'),
    );
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
