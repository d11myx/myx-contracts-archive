// @ts-ignore
import { ethers } from 'hardhat';
import { getFundingRate, getPool, loadReserveConfig, MARKET_NAME, waitForTx, ZERO_ADDRESS } from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const pool = await getPool();
    const fundingRate = await getFundingRate();

    const reserveConfig = loadReserveConfig(MARKET_NAME);
    const pairConfigs = reserveConfig?.PairsConfig;

    const tradingConfig = pairConfigs['WETH'].fundingFeeConfig;
    // console.log(tradingConfig);

    await waitForTx(await fundingRate.updateFundingFeeConfig(2, tradingConfig));
    console.log(await fundingRate.fundingFeeConfigs(2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
