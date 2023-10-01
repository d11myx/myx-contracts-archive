import { task } from 'hardhat/config';

// @ts-ignore
import abiDecoder from 'abi-decoder';
import { boolean } from 'hardhat/internal/core/params/argumentTypes';

task('decode-event', 'decode trx event logs')
    .addParam('hash', 'trx hash')
    .addOptionalParam('log', 'log', false, boolean)
    .setAction(async (param, hre) => {
        const fullNames = await hre.artifacts.getAllFullyQualifiedNames();
        for (let fullName of fullNames) {
            let contract = await hre.artifacts.readArtifact(fullName);
            abiDecoder.addABI(contract.abi);
        }
        let receipt = await hre.ethers.provider.getTransactionReceipt(param.hash);
        const decodeLogs = abiDecoder.decodeLogs(receipt.logs);
        for (let decodeLog of decodeLogs) {
            if (param.log) {
                console.log(decodeLog);
            }
        }
        return decodeLogs;
    });
