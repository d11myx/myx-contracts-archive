// @ts-ignore
import { ethers } from 'hardhat';
import { getPool, loadReserveConfig, MARKET_NAME, ZERO_ADDRESS } from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const pool = await getPool();

    const reserveConfig = loadReserveConfig(MARKET_NAME);
    const pairConfigs = reserveConfig?.PairsConfig;

    const tradingConfig = pairConfigs['WETH'].tradingConfig;
    // console.log(tradingConfig);

    console.log(await pool.getPair(2));
    await pool.updateTradingConfig(2, tradingConfig);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
