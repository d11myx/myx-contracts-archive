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
    const vaas = await conn.getLatestVaas([priceId]);
    const priceFeedUpdate = '0x' + Buffer.from(vaas[0], 'base64').toString('hex');

    const pythContract = await ethers.getContractAt('IPyth', '0xdF21D137Aadc95588205586636710ca2890538d5');

    const updateFee = pythContract.getUpdateFee(priceFeedUpdate);
    const tx = await pythContract.updatePriceFeeds([priceFeedUpdate], {
        value: 1,
    });
    await waitForTx(tx);
    console.log(await pythContract.getPriceNoOlderThan(priceId, 20));

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

    // for (let i = 0; i < 20; i++) {
    //     const ret = (await conn.getLatestPriceFeeds([priceId])) as any[];
    //     const price: Price = ret[0].price;
    //     console.log(`publishTime: ${timeStr(price.publishTime)}  price: ${ethers.utils.formatUnits(price.price, 8)}`);
    // }
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
