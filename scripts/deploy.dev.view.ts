// @ts-ignore
import { ethers } from 'hardhat';
import { getOraclePriceFeed, getPool, getTokens } from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    // const router = await getRouter();
    // const orderManager = await getOrderManager();
    // const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    // const executionLogic = await getExecutionLogic();
    const priceOracle = await getOraclePriceFeed();
    const pool = await getPool();

    const { btc, eth, usdt } = await getTokens();

    const btcOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    const btcIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
