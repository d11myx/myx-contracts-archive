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

    const tradingConfig = pairConfigs['WBTC'].pair;
    // console.log(tradingConfig);

    console.log(await pool.getPair(1));
    // await pool.updatePair(1, {
    //     pairIndex: 1,
    //     indexToken: '0xA92368aE01D6203101F40b856d3341EdC6E78339',
    //     stableToken: '0x93d67359A0f6F117150a70fDde6BB96782497248',
    //     pairToken: '0x1EBb831953f57dB849753d27CC53492b39ee6D0f',
    //     enable: true,
    //     kOfSwap: ethers.utils.parseUnits('4.4', 46),
    //     expectIndexTokenP: 50000000, //50%
    //     maxUnbalancedP: 30000000, //10%
    //     unbalancedDiscountRate: 100000, //0.1%
    //     addLpFeeP: 100000, //0.1%
    //     removeLpFeeP: 300000, //0.3%
    //     lpFeeDistributeP: 0, //deprecated
    // });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
