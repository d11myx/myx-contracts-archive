import { task } from 'hardhat/config';
// @ts-ignore
import abiDecoder from 'abi-decoder';

task('encode-event', 'get method artifact detail by method name')
    .addOptionalParam('contract', 'contract name')
    .setAction(async (param, hre) => {
        const fullNames = await hre.artifacts.getAllFullyQualifiedNames();
        for (let fullName of fullNames) {
            let contract = await hre.artifacts.readArtifact(fullName);
            if (contract.contractName == param.contract) {
                console.log(`contract:`, contract.contractName);
                abiDecoder.addABI(contract.abi);
            }
        }
        let methodObject = abiDecoder.getMethodIDs();
        Object.keys(methodObject).forEach(function (methodId: string, index: number, arr: any) {
            let method = methodObject[methodId];
            if (method.type == 'event') {
                console.log(`event: ${method.name} id: ${methodId}`);
            }
        });
    });
