import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
// import 'hardhat-gas-reporter';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-contract-sizer';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'solidity-coverage';
import 'hardhat-log-remover';
import { getCurrentTimestamp } from 'hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp';
import { DEFAULT_NAMED_ACCOUNTS, loadTasks } from './helpers';

dotenv.config();

const LOCAL_PRIVATE_KEY1 = '0xa470e816670131554b9dae535a27b63406a07815ae755caa1e0c26a0ab34b93a';
const LOCAL_PRIVATE_KEY2 = '0xbeb4ddb2cf1927167c7bc2e1c22f91f626debcf2bff509b30516559f34dd936f';
const LOCAL_PRIVATE_KEY3 = '0xbdd47d2ca2eaeb0e10271e796f786fb11195dd99265f84270ae198eb211ff7b9';
const LOCAL_PRIVATE_KEY4 = '0xa48493ed38946ad393e84984cbfe939cd3baf2001912f0fc0523adf78099d0cc';
const LOCAL_PRIVATE_KEY5 = '0xd1beb461ced700e79f53ced3ff7e3190b3e3019aa95b45921888b4f522da4920';
const LOCAL_PRIVATE_KEY6 = '0x410eb34d72872241bd340658f373ae277f1f2641c08697b5c6ebdb570422fe93';
const LOCAL_PRIVATE_KEY7 = '0x469bcef05f195f24d0f6744a7f9aecceeab73bb7f9c6900e2ca19cc6e5f1c188';
const LOCAL_PRIVATE_KEY8 = '0xe06cb221b4292e014b3d0fa011d4566e88f4564cb6367ad34f40209f09315c61';
const LOCAL_PRIVATE_KEY9 = '0xf694662d5a2129ec6740a9780a0eb8c8798cf57cfc3524e4ec12f3362eb05132';
const LOCAL_PRIVATE_KEY10 = '0x10e31ef6e0c79bdce8f90ac1ee2f00e3fa893252a90cbf1e4dff16fdaa1ec416';
const LOCAL_PRIVATE_KEY11 = '0xb8ed88b425a94e2f27f545e770f3af40b997fa7c6d6b841aa19e08ac22219b48';
const LOCAL_PRIVATE_KEY12 = '0xbff7c1194ab8971a7f1ea23cc6c4d2e8720fc7eecbc1554775187fd82d9c70ad';
const LOCAL_PRIVATE_KEY13 = '0x05450ad24fd0e22e68c651df547e6a7d0927a50ce3c48c2c1875df687a226031';
const LOCAL_PRIVATE_KEY14 = '0xce1a2d4ac18162b3744b351e76dff3ef4af13b15a800fca7cd0a107aa2590054';
const LOCAL_PRIVATE_KEY15 = '0xea6939b916b1a694d7d1d8f2850c7970fb4cc974da41739c65dbd14b847fdb22';
const LOCAL_PRIVATE_KEY16 = '0x6ce90057842eba2fe67a6aa284d7b04a6b3abdd60bf9b118dc86f187f753c608';
const LOCAL_PRIVATE_KEY17 = '0x8bf56fecbb2c1cf429e9440b930875525905476d7e16419f2a0e7b227c18135f';
const LOCAL_PRIVATE_KEY18 = '0x0925c9d778e1091136e2adeab85c2cf6b150b2f17daa600635c8cdbccd481949';
const LOCAL_PRIVATE_KEY19 = '0x7372f4fc47d47787c9e9a3232f10b16cc56f877354e3bb553d324d45b3831eed';
const LOCAL_PRIVATE_KEY20 = '0x8305ef87d02dd3890cb8a9d747274f7da6013c2f41878da410a2ceaba2a26c61';

const GOERLI_PRIVATE_KEY1 = '0x35fb41f603c91d8fdf29391ce17e96d50f028dd895762027806cde096dca8a3b';
const GOERLI_PRIVATE_KEY2 = '0x56e7a541829f9e675773c9e2542fe31c6cd8c742f156c1b5beafe3f4f483eea2';
const GOERLI_PRIVATE_KEY3 = '0xe9733eeed09ad95c2ef876eb7c9073a68a49651101f93dfdc56bea3b16baabcd';
const GOERLI_PRIVATE_KEY4 = '0x2f218d6f236015060f30827825d5d24711d01d502d0a5bd3ec85043ff45c2ae2';
const GOERLI_PRIVATE_KEY5 = '0xa661ddc2b2524edf18074ac62ed919c8af1fedcd658d5361e0ed7eee249ff168';

const SKIP_LOAD = process.env.SKIP_LOAD === 'true';
const TASK_FOLDERS = ['./misc'];

// Prevent to load tasks before compilation and typechain
if (!SKIP_LOAD) {
    loadTasks(TASK_FOLDERS);
}

// const GOERLI_DEPLOY_KEY = "";
const abiDecoder = require('abi-decoder');

task('decode-event', 'decode trx event logs')
    .addParam('hash', 'trx hash')
    .setAction(async (param, hre) => {
        const fullNames = await hre.artifacts.getAllFullyQualifiedNames();
        for (let fullName of fullNames) {
            let contract = await hre.artifacts.readArtifact(fullName);
            abiDecoder.addABI(contract.abi);
        }
        let receipt = await hre.ethers.provider.getTransactionReceipt(param.hash);
        const decodedLogs = abiDecoder.decodeLogs(receipt.logs);
        for (let event of decodedLogs) {
            console.log(event);
        }
    });

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

const gas = 'auto';
const gasPrice = 'auto';

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.17',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: true,
        },
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        local: {
            url: 'http://127.0.0.1:8545/',
            accounts: [
                LOCAL_PRIVATE_KEY1,
                LOCAL_PRIVATE_KEY2,
                LOCAL_PRIVATE_KEY3,
                LOCAL_PRIVATE_KEY4,
                LOCAL_PRIVATE_KEY5,
                LOCAL_PRIVATE_KEY6,
                LOCAL_PRIVATE_KEY7,
                LOCAL_PRIVATE_KEY8,
                LOCAL_PRIVATE_KEY9,
                LOCAL_PRIVATE_KEY10,
                LOCAL_PRIVATE_KEY11,
                LOCAL_PRIVATE_KEY12,
                LOCAL_PRIVATE_KEY13,
                LOCAL_PRIVATE_KEY14,
                LOCAL_PRIVATE_KEY15,
                LOCAL_PRIVATE_KEY16,
                LOCAL_PRIVATE_KEY17,
                LOCAL_PRIVATE_KEY18,
                LOCAL_PRIVATE_KEY19,
                LOCAL_PRIVATE_KEY20,
            ],
            gas: 4000000,
            gasPrice: 20000000000,
            // zksync: true,
        },
        remote: {
            url: 'http://18.166.30.91:8545/',
            accounts: [
                LOCAL_PRIVATE_KEY1,
                LOCAL_PRIVATE_KEY2,
                LOCAL_PRIVATE_KEY3,
                LOCAL_PRIVATE_KEY4,
                LOCAL_PRIVATE_KEY5,
                LOCAL_PRIVATE_KEY6,
                LOCAL_PRIVATE_KEY7,
                LOCAL_PRIVATE_KEY8,
                LOCAL_PRIVATE_KEY9,
                LOCAL_PRIVATE_KEY10,
                LOCAL_PRIVATE_KEY11,
                LOCAL_PRIVATE_KEY12,
                LOCAL_PRIVATE_KEY13,
                LOCAL_PRIVATE_KEY14,
                LOCAL_PRIVATE_KEY15,
                LOCAL_PRIVATE_KEY16,
                LOCAL_PRIVATE_KEY17,
                LOCAL_PRIVATE_KEY18,
                LOCAL_PRIVATE_KEY19,
                LOCAL_PRIVATE_KEY20,
            ],
            // gas: gas,
            // gasPrice: gasPrice
        },
        remote_test: {
            url: 'https://myx-test-rpc.myx.cash',
            chainId: 31338,
            accounts: [
                LOCAL_PRIVATE_KEY1,
                LOCAL_PRIVATE_KEY2,
                LOCAL_PRIVATE_KEY3,
                LOCAL_PRIVATE_KEY4,
                LOCAL_PRIVATE_KEY5,
                LOCAL_PRIVATE_KEY6,
                LOCAL_PRIVATE_KEY7,
                LOCAL_PRIVATE_KEY8,
                LOCAL_PRIVATE_KEY9,
                LOCAL_PRIVATE_KEY10,
                LOCAL_PRIVATE_KEY11,
                LOCAL_PRIVATE_KEY12,
                LOCAL_PRIVATE_KEY13,
                LOCAL_PRIVATE_KEY14,
                LOCAL_PRIVATE_KEY15,
                LOCAL_PRIVATE_KEY16,
                LOCAL_PRIVATE_KEY17,
                LOCAL_PRIVATE_KEY18,
                LOCAL_PRIVATE_KEY19,
                LOCAL_PRIVATE_KEY20,
            ],
        },
        goerli: {
            // url: "https://rpc.ankr.com/eth_goerli",
            url: 'https://goerli.infura.io/v3/c0beb1509e87416b83e1d9e02203bef7',
            accounts: [
                GOERLI_PRIVATE_KEY1,
                GOERLI_PRIVATE_KEY2,
                GOERLI_PRIVATE_KEY3,
                GOERLI_PRIVATE_KEY4,
                GOERLI_PRIVATE_KEY5,
            ],
        },
    },
    namedAccounts: {
        ...DEFAULT_NAMED_ACCOUNTS,
    },
    etherscan: {
        apiKey: 'M5SDQD75WPPKN8XTUZM86BE46VAGUEBCE8',
    },
    abiExporter: {
        runOnCompile: true,
        clear: true,
    },
    typechain: {
        outDir: 'types',
        target: 'ethers-v5',
    },
};
export default config;
