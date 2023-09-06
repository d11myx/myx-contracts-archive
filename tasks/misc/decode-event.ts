import { task } from 'hardhat/config';

// @ts-ignore
import abiDecoder from 'abi-decoder';

task('decode-event', 'decode trx event logs')
    .addParam('hash', 'trx hash')
    .setAction(async (param, hre) => {
        const fullNames = await hre.artifacts.getAllFullyQualifiedNames();
        for (let fullName of fullNames) {
            let contract = await hre.artifacts.readArtifact(fullName);
            abiDecoder.addABI(contract.abi);
        }
        let receipt = await hre.ethers.provider.getTransactionReceipt(param.hash);
        return abiDecoder.decodeLogs(receipt.logs);
    });
