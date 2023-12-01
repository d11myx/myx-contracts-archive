// @ts-ignore
import hre, { ethers } from 'hardhat';
import {
    getBlockTimestamp,
    getIndexPriceFeed,
    getMockToken,
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
// import { getContractAt } from '@nomiclabs/hardhat-ethers/internal/helpers';
// import { token } from '../types/contracts';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    const pyth = await ethers.getContractAt('PythOraclePriceFeed', '0x8AeEef94c6A2de6666A05BD52e39e6e72FBf20AE');
    const pool = await ethers.getContractAt('Pool', '0x9afD7dE35509c1a8D513cDb3C5AEc1C9bE87989F');
    const router = await ethers.getContractAt('Router', '0x96c8D2C44237e178636f6E43cd7B3DBcB11F4Da9');
    // console.log(await pyth.getPriceSafely('0xCF7230366c3b0d8AEc41e2320B7C9dD7AE46bfc6'));
    
    // const btc = await getMockToken('', '0xCF7230366c3b0d8AEc41e2320B7C9dD7AE46bfc6');
    // const usdt = await getMockToken('', '0x43D9A80A86CcB7abB5BDEed5d85CA5D2Cc120859');

    // let tx = await btc.connect(deployer).approve(router.address, ethers.utils.parseUnits('100000000000', 8));
    // let receipt = await waitForTx(tx)
    // console.log(`block: ${receipt.blockNumber}  btchash: ${receipt.blockHash}`);

    // tx = await usdt.connect(deployer).approve(router.address, ethers.utils.parseUnits('100000000000000', 6));
    // receipt = await waitForTx(tx)
    // console.log(`block: ${receipt.blockNumber}  usdthash: ${receipt.blockHash}`);
    

    for (let i = 0; i < 10; i++) {
        const inAmount = ethers.utils.parseUnits('1000000', 18);
        const depositAmounts = await pool.getDepositAmount(1, inAmount, await pyth.getPriceSafely('0xCF7230366c3b0d8AEc41e2320B7C9dD7AE46bfc6'));
        console.log(depositAmounts.depositIndexAmount.toString())
    
        const priceId = '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b';
        const conn = new EvmPriceServiceConnection('https://hermes-beta.pyth.network');
        // // const priceFeedUpdate = await conn.getPriceFeedsUpdateData([priceId]);

        // // console.log(await conn.getLatestPriceFeeds([priceId]));
        const vaas = await conn.getLatestVaas([priceId]);
        const priceFeedUpdate = '0x' + Buffer.from(vaas[0], 'base64').toString('hex');
        console.log(priceFeedUpdate)

        console.log(depositAmounts.depositIndexAmount.toString(),' - ', depositAmounts.depositStableAmount.toString())
    
        const tx = await router.addLiquidity(
            "0xCF7230366c3b0d8AEc41e2320B7C9dD7AE46bfc6",
            "0x43D9A80A86CcB7abB5BDEed5d85CA5D2Cc120859",
            depositAmounts.depositIndexAmount.toString(),
            depositAmounts.depositStableAmount.toString(),
            ["0xCF7230366c3b0d8AEc41e2320B7C9dD7AE46bfc6"],
            [priceFeedUpdate],
            {value: 1}
        )

        const receipt = await waitForTx(tx)
        console.log(`block: ${receipt.blockNumber}  addlphash: ${receipt.blockHash}`);
    }

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
