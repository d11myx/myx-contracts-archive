import { task } from 'hardhat/config';
import { getCurrentTimestamp } from 'hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp';

task('update-evm-time', 'update evm time')
    .addParam('increase', 'increase or decrease minutes')
    .setAction(async (param, hre) => {
        let blockNumber = await hre.ethers.provider.getBlockNumber();
        let block = await hre.ethers.provider.getBlock(blockNumber);
        console.log(`block time ${block.timestamp} diff ${block.timestamp - getCurrentTimestamp()}`);

        await hre.network.provider.send('evm_increaseTime', [parseInt(param.increase)]);

        await new Promise((resolve) => setTimeout(resolve, 3000));

        blockNumber = await hre.ethers.provider.getBlockNumber();
        block = await hre.ethers.provider.getBlock(blockNumber);
        console.log(`block time ${block.timestamp} diff ${block.timestamp - getCurrentTimestamp()}`);
    });
