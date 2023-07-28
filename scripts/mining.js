const hre = require('hardhat');
const {getBlockTime} = require("./utils/utilities");
const {getCurrentTimestamp} = require("hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp");

async function main() {
    await hre.network.provider.send('evm_setIntervalMining', [3000]);

    // sync block time
    let blockTime = await getBlockTime(await hre.ethers.provider);
    let currentTime = getCurrentTimestamp();
    let diff = currentTime - blockTime;
    console.log(`current time ${currentTime} block time ${blockTime} diff ${diff}`)
    await hre.network.provider.send('evm_increaseTime', [diff]);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    blockTime = await getBlockTime(await hre.ethers.provider);
    currentTime = getCurrentTimestamp();
    diff = currentTime - blockTime;
    console.log(`current time ${currentTime} block time ${blockTime} diff ${diff}`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
