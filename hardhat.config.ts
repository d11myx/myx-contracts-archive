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
import 'keccak256';
import 'merkletreejs';
import { getCurrentTimestamp } from 'hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp';
import { DEFAULT_NAMED_ACCOUNTS, loadTasks } from './helpers';

dotenv.config();

const DEV_PRIVATE_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEV_PRIVATE_KEY1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const DEV_PRIVATE_KEY2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const DEV_PRIVATE_KEY3 = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
const DEV_PRIVATE_KEY4 = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const DEV_PRIVATE_KEY5 = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
const DEV_PRIVATE_KEY6 = '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e';
const DEV_PRIVATE_KEY7 = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356';
const DEV_PRIVATE_KEY8 = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97';
const DEV_PRIVATE_KEY9 = '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6';
const DEV_PRIVATE_KEY10 = '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897';
const DEV_PRIVATE_KEY11 = '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82';
const DEV_PRIVATE_KEY12 = '0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1';
const DEV_PRIVATE_KEY13 = '0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd';
const DEV_PRIVATE_KEY14 = '0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa';
const DEV_PRIVATE_KEY15 = '0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61';
const DEV_PRIVATE_KEY16 = '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0';
const DEV_PRIVATE_KEY17 = '0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd';
const DEV_PRIVATE_KEY18 = '0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0';
const DEV_PRIVATE_KEY19 = '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e';

const REMOTE_PRIVATE_KEY0 = '0xa470e816670131554b9dae535a27b63406a07815ae755caa1e0c26a0ab34b93a';
const REMOTE_PRIVATE_KEY1 = '0xbeb4ddb2cf1927167c7bc2e1c22f91f626debcf2bff509b30516559f34dd936f';
const REMOTE_PRIVATE_KEY2 = '0xbdd47d2ca2eaeb0e10271e796f786fb11195dd99265f84270ae198eb211ff7b9';
const REMOTE_PRIVATE_KEY3 = '0xa48493ed38946ad393e84984cbfe939cd3baf2001912f0fc0523adf78099d0cc';
const REMOTE_PRIVATE_KEY4 = '0xd1beb461ced700e79f53ced3ff7e3190b3e3019aa95b45921888b4f522da4920';
const REMOTE_PRIVATE_KEY5 = '0x410eb34d72872241bd340658f373ae277f1f2641c08697b5c6ebdb570422fe93';
const REMOTE_PRIVATE_KEY6 = '0x469bcef05f195f24d0f6744a7f9aecceeab73bb7f9c6900e2ca19cc6e5f1c188';
const REMOTE_PRIVATE_KEY7 = '0xe06cb221b4292e014b3d0fa011d4566e88f4564cb6367ad34f40209f09315c61';
const REMOTE_PRIVATE_KEY8 = '0xf694662d5a2129ec6740a9780a0eb8c8798cf57cfc3524e4ec12f3362eb05132';
const REMOTE_PRIVATE_KEY9 = '0x10e31ef6e0c79bdce8f90ac1ee2f00e3fa893252a90cbf1e4dff16fdaa1ec416';
const REMOTE_PRIVATE_KEY10 = '0xb8ed88b425a94e2f27f545e770f3af40b997fa7c6d6b841aa19e08ac22219b48';
const REMOTE_PRIVATE_KEY11 = '0xbff7c1194ab8971a7f1ea23cc6c4d2e8720fc7eecbc1554775187fd82d9c70ad';
const REMOTE_PRIVATE_KEY12 = '0x05450ad24fd0e22e68c651df547e6a7d0927a50ce3c48c2c1875df687a226031';
const REMOTE_PRIVATE_KEY13 = '0xce1a2d4ac18162b3744b351e76dff3ef4af13b15a800fca7cd0a107aa2590054';
const REMOTE_PRIVATE_KEY14 = '0xea6939b916b1a694d7d1d8f2850c7970fb4cc974da41739c65dbd14b847fdb22';
const REMOTE_PRIVATE_KEY15 = '0x6ce90057842eba2fe67a6aa284d7b04a6b3abdd60bf9b118dc86f187f753c608';
const REMOTE_PRIVATE_KEY16 = '0x8bf56fecbb2c1cf429e9440b930875525905476d7e16419f2a0e7b227c18135f';
const REMOTE_PRIVATE_KEY17 = '0x0925c9d778e1091136e2adeab85c2cf6b150b2f17daa600635c8cdbccd481949';
const REMOTE_PRIVATE_KEY18 = '0x7372f4fc47d47787c9e9a3232f10b16cc56f877354e3bb553d324d45b3831eed';
const REMOTE_PRIVATE_KEY19 = '0x8305ef87d02dd3890cb8a9d747274f7da6013c2f41878da410a2ceaba2a26c61';

const GOERLI_PRIVATE_KEY0 = '0x35fb41f603c91d8fdf29391ce17e96d50f028dd895762027806cde096dca8a3b';
const GOERLI_PRIVATE_KEY1 = '0x56e7a541829f9e675773c9e2542fe31c6cd8c742f156c1b5beafe3f4f483eea2';
const GOERLI_PRIVATE_KEY2 = '0xe9733eeed09ad95c2ef876eb7c9073a68a49651101f93dfdc56bea3b16baabcd';
const GOERLI_PRIVATE_KEY3 = '0x2f218d6f236015060f30827825d5d24711d01d502d0a5bd3ec85043ff45c2ae2';
const GOERLI_PRIVATE_KEY4 = '0xa661ddc2b2524edf18074ac62ed919c8af1fedcd658d5361e0ed7eee249ff168';

const BSC_TEST_PRIVATE_KEY0 = '0x65091b97411c66d154fdcd0df561c8922776ea41189472ace89695413426b57a';
const BSC_TEST_PRIVATE_KEY1 = '0x99c0023272b43b36f19de100d21ec249a16779f197227e7d660f7c45d07e6c2c';
const BSC_TEST_PRIVATE_KEY2 = '0xe5bdef804789f48de7b49a845f1cf03646d865ba11c77f77a226ddbaa8548bb5';
const BSC_TEST_PRIVATE_KEY3 = '0x3679e8f54128f28c216d666d70e58a1afb42dea9161250b6706ab596b363b839';
const BSC_TEST_PRIVATE_KEY4 = '0x3ea5ea3aaf39b07dfd9f7507ebf89e52b901342a7a20f6aa812d9c9e622d6966';

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
                DEV_PRIVATE_KEY0,
                DEV_PRIVATE_KEY1,
                DEV_PRIVATE_KEY2,
                DEV_PRIVATE_KEY3,
                DEV_PRIVATE_KEY4,
                DEV_PRIVATE_KEY5,
                DEV_PRIVATE_KEY6,
                DEV_PRIVATE_KEY7,
                DEV_PRIVATE_KEY8,
                DEV_PRIVATE_KEY9,
                DEV_PRIVATE_KEY10,
                DEV_PRIVATE_KEY11,
                DEV_PRIVATE_KEY12,
                DEV_PRIVATE_KEY13,
                DEV_PRIVATE_KEY14,
                DEV_PRIVATE_KEY15,
                DEV_PRIVATE_KEY16,
                DEV_PRIVATE_KEY17,
                DEV_PRIVATE_KEY18,
                DEV_PRIVATE_KEY19,
            ],
            gas: 4000000,
            gasPrice: 20000000000,
            // zksync: true,
        },
        remote_dev: {
            url: 'http://43.198.67.105:8545/',
            accounts: [
                DEV_PRIVATE_KEY0,
                DEV_PRIVATE_KEY1,
                DEV_PRIVATE_KEY2,
                DEV_PRIVATE_KEY3,
                DEV_PRIVATE_KEY4,
                DEV_PRIVATE_KEY5,
                DEV_PRIVATE_KEY6,
                DEV_PRIVATE_KEY7,
                DEV_PRIVATE_KEY8,
                DEV_PRIVATE_KEY9,
                DEV_PRIVATE_KEY10,
                DEV_PRIVATE_KEY11,
                DEV_PRIVATE_KEY12,
                DEV_PRIVATE_KEY13,
                DEV_PRIVATE_KEY14,
                DEV_PRIVATE_KEY15,
                DEV_PRIVATE_KEY16,
                DEV_PRIVATE_KEY17,
                DEV_PRIVATE_KEY18,
                DEV_PRIVATE_KEY19,
            ],
            // gas: gas,
            // gasPrice: gasPrice
        },
        remote: {
            url: 'http://18.166.30.91:8545/',
            accounts: [
                REMOTE_PRIVATE_KEY0,
                REMOTE_PRIVATE_KEY1,
                REMOTE_PRIVATE_KEY2,
                REMOTE_PRIVATE_KEY3,
                REMOTE_PRIVATE_KEY4,
                REMOTE_PRIVATE_KEY5,
                REMOTE_PRIVATE_KEY6,
                REMOTE_PRIVATE_KEY7,
                REMOTE_PRIVATE_KEY8,
                REMOTE_PRIVATE_KEY9,
                REMOTE_PRIVATE_KEY10,
                REMOTE_PRIVATE_KEY11,
                REMOTE_PRIVATE_KEY12,
                REMOTE_PRIVATE_KEY13,
                REMOTE_PRIVATE_KEY14,
                REMOTE_PRIVATE_KEY15,
                REMOTE_PRIVATE_KEY16,
                REMOTE_PRIVATE_KEY17,
                REMOTE_PRIVATE_KEY18,
                REMOTE_PRIVATE_KEY19,
            ],
            // gas: gas,
            // gasPrice: gasPrice
        },
        remote_test: {
            url: 'https://myx-test-rpc.myx.cash',
            chainId: 31338,
            accounts: [
                REMOTE_PRIVATE_KEY0,
                REMOTE_PRIVATE_KEY1,
                REMOTE_PRIVATE_KEY2,
                REMOTE_PRIVATE_KEY3,
                REMOTE_PRIVATE_KEY4,
                REMOTE_PRIVATE_KEY5,
                REMOTE_PRIVATE_KEY6,
                REMOTE_PRIVATE_KEY7,
                REMOTE_PRIVATE_KEY8,
                REMOTE_PRIVATE_KEY9,
                REMOTE_PRIVATE_KEY10,
                REMOTE_PRIVATE_KEY11,
                REMOTE_PRIVATE_KEY12,
                REMOTE_PRIVATE_KEY13,
                REMOTE_PRIVATE_KEY14,
                REMOTE_PRIVATE_KEY15,
                REMOTE_PRIVATE_KEY16,
                REMOTE_PRIVATE_KEY17,
                REMOTE_PRIVATE_KEY18,
                REMOTE_PRIVATE_KEY19,
            ],
        },
        remote_pre: {
            url: 'https://pre-rpc.myx.cash',
            chainId: 131338,
            accounts: [
                REMOTE_PRIVATE_KEY0,
                REMOTE_PRIVATE_KEY1,
                REMOTE_PRIVATE_KEY2,
                REMOTE_PRIVATE_KEY3,
                REMOTE_PRIVATE_KEY4,
                REMOTE_PRIVATE_KEY5,
                REMOTE_PRIVATE_KEY6,
                REMOTE_PRIVATE_KEY7,
                REMOTE_PRIVATE_KEY8,
                REMOTE_PRIVATE_KEY9,
                REMOTE_PRIVATE_KEY10,
                REMOTE_PRIVATE_KEY11,
                REMOTE_PRIVATE_KEY12,
                REMOTE_PRIVATE_KEY13,
                REMOTE_PRIVATE_KEY14,
                REMOTE_PRIVATE_KEY15,
                REMOTE_PRIVATE_KEY16,
                REMOTE_PRIVATE_KEY17,
                REMOTE_PRIVATE_KEY18,
                REMOTE_PRIVATE_KEY19,
            ],
        },
        bsc_test: {
            url: 'https://bsc-testnet.publicnode.com',
            accounts: [
                BSC_TEST_PRIVATE_KEY0,
                BSC_TEST_PRIVATE_KEY1,
                BSC_TEST_PRIVATE_KEY2,
                BSC_TEST_PRIVATE_KEY3,
                BSC_TEST_PRIVATE_KEY4,
            ],
        },
        goerli: {
            // url: "https://rpc.ankr.com/eth_goerli",
            url: 'https://goerli.infura.io/v3/c0beb1509e87416b83e1d9e02203bef7',
            accounts: [
                GOERLI_PRIVATE_KEY0,
                GOERLI_PRIVATE_KEY1,
                GOERLI_PRIVATE_KEY2,
                GOERLI_PRIVATE_KEY3,
                GOERLI_PRIVATE_KEY4,
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
