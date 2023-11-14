// @ts-ignore
import hre, { ethers } from 'hardhat';
import {
    getBlockTimestamp,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRouter,
    getTokens,
    log,
    waitForTx,
} from '../helpers';
import { EvmPriceServiceConnection, Price, PriceFeed } from '@pythnetwork/pyth-evm-js';
import { getContractAt } from '@nomiclabs/hardhat-ethers/internal/helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    // const router = await getRouter();
    // const orderManager = await getOrderManager();
    // const positionManager = await getPositionManager();
    // // const executor = await getExecutor();
    // // const executionLogic = await getExecutionLogic();
    // const oraclePriceFeed = await getOraclePriceFeed();
    // const indexPriceFeed = await getIndexPriceFeed();
    // const pool = await getPool();
    //
    // const { btc, eth, usdt } = await getTokens();
    //
    // const btcOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30);
    // const ethOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30);
    // const btcIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(btc.address), 30);
    // const ethIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(eth.address), 30);
    // console.log(`btc price:`, btcOraclePrice);
    // console.log(`eth price:`, ethOraclePrice);
    // console.log(`btc price:`, btcIndexPrice);
    // console.log(`eth price:`, ethIndexPrice);
    //
    const priceId = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const conn = new EvmPriceServiceConnection('https://hermes.pyth.network');
    //
    // // const priceFeedUpdate = await conn.getPriceFeedsUpdateData([priceId]);
    //
    // // console.log(await conn.getLatestPriceFeeds([priceId]));
    // const vaas = await conn.getLatestVaas([priceId]);
    // const priceFeedUpdate = '0x' + Buffer.from(vaas[0], 'base64').toString('hex');
    //
    // const testFactory = await ethers.getContractFactory('Test');
    // const testContract = await testFactory.deploy();
    //
    // const pythContract = await ethers.getContractAt('IPyth', '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729');
    // // const test = await ethers.getContractAt('Test', '0x71C630c897cA4DFdB31f3e0FAEa8EC08b628eEe4');
    // // console.log(`test: ${testContract.address}`);
    //
    // await waitForTx(await testContract.setPrice([priceFeedUpdate], [priceId], { value: 1 }));
    //
    // // const tx = await pythContract.updatePriceFeedsIfNecessary([priceFeedUpdate], [priceId], [getBlockTimestamp()], {
    // //     value: 1,
    // // });
    // // const tx = await pythContract.updatePriceFeeds([priceFeedUpdate], {
    // //     value: 1,
    // // });
    // // await waitForTx(tx);
    // // console.log(`tx hash: ${tx.hash}`);
    //
    // try {
    //     console.log('getPriceUnsafe:');
    //     const { price, publishTime } = await testContract.getPriceUnsafe([priceId]);
    //     console.log(ethers.utils.formatUnits(price, 8));
    //     console.log();
    // } catch (e) {}
    //
    // try {
    //     console.log('getPrice:');
    //     console.log(await testContract.getPrice([priceId]));
    //     console.log();
    // } catch (e) {}
    //
    // try {
    //     console.log('getPriceNoOlderThan:');
    //     console.log(await testContract.getPriceNoOlderThan([priceId]));
    //     console.log();
    // } catch (e) {}

    for (let i = 0; i < 20; i++) {
        const ret = (await conn.getLatestPriceFeeds([priceId])) as any[];
        const price: Price = ret[0].price;
        console.log(`publishTime: ${timeStr(price.publishTime)}  price: ${ethers.utils.formatUnits(price.price, 8)}`);
    }
}

function timeStr(timestamp: number) {
    let date = new Date(timestamp * 1000);
    let Year = date.getFullYear();
    let Moth = date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1;
    let Day = date.getDate() < 10 ? '0' + date.getDate() : date.getDate();
    let Hour = date.getHours() < 10 ? '0' + date.getHours() : date.getHours();
    let Minute = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
    let second = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds();
    return Year + '-' + Moth + '-' + Day + ' ' + Hour + ':' + Minute + ':' + second;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
