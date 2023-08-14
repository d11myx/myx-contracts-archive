const hre = require('hardhat');
const {getBlockTime} = require("./utils/utilities");
const {getCurrentTimestamp} = require("hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp");
const {sleep, syncBlockTime} = require("./utils/helpers");

async function main() {
    await hre.network.provider.send('evm_setIntervalMining', [3000]);

    // sync block time
    await syncBlockTime();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
