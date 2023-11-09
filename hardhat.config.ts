import * as dotenv from 'dotenv';

import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
// import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import '@openzeppelin/hardhat-upgrades';
import 'solidity-coverage';
import 'hardhat-log-remover';
import 'keccak256';
import 'merkletreejs';
import { DEFAULT_NAMED_ACCOUNTS, loadTasks } from './helpers';
import 'hardhat-dependency-compiler';
// import '@nomicfoundation/hardhat-verify';

dotenv.config();

function getEnvAccounts(accountStr: string) {
    if (!accountStr || accountStr.length <= 0) {
        return [];
    }
    const accounts = accountStr.split(',');
    return accounts.filter((value) => value.length > 0).map((value) => value.trim());
}

const MNEMONIC_PATH = "m/44'/60'/0'/0";

const SKIP_LOAD = process.env.SKIP_LOAD === 'true';
const TASK_FOLDERS = ['./misc'];

// Prevent to load tasks before compilation and typechain
if (!SKIP_LOAD) {
    loadTasks(TASK_FOLDERS);
}

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.19',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            // evmVersion: 'london',
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
        dev_local: {
            url: 'https://pre-rpc.myx.cash',
            chainId: 131338,
            accounts: getEnvAccounts(process.env.ACCOUNTS_DEV as string),
            live: false,
        },
        ethereum_goerli: {
            url: 'https://goerli.infura.io/v3/c0beb1509e87416b83e1d9e02203bef7',
            accounts: {
                mnemonic: process.env.MNEMONIC_ETHEREUM_GOERLI || '',
                path: MNEMONIC_PATH,
                initialIndex: 0,
                count: 10,
            },
            live: false,
        },
        linea_goerli: {
            url: 'https://rpc.goerli.linea.build',
            chainId: 59140,
            accounts: {
                mnemonic: process.env.MNEMONIC_LINEA_GOERLI || '',
                path: MNEMONIC_PATH,
                initialIndex: 0,
                count: 10,
            },
            live: false,
        },
        linea_mainnet: {
            url: 'https://rpc.linea.build',
            chainId: 59144,
            accounts: {
                mnemonic: process.env.MNEMONIC_LINEA_MAINNET || '',
                path: MNEMONIC_PATH,
                initialIndex: 0,
                count: 10,
            },
            live: true,
        },
        scroll_sepolia: {
            url: 'https://scroll-sepolia.blockpi.network/v1/rpc/public',
            chainId: 534351,
            accounts: {
                mnemonic: process.env.MNEMONIC_SCROLL_SEPOLIA || '',
                path: MNEMONIC_PATH,
                initialIndex: 0,
                count: 10,
            },
            live: false,
        },
    },
    namedAccounts: {
        ...DEFAULT_NAMED_ACCOUNTS,
    },
    etherscan: {
        apiKey: {
            linea_goerli: '6WZUFU45J91UMAHDV2C52TV8RAJAQASIZR',
            linea_mainnet: 'I7TMBCCPR75UPE2H14EIWDYS469TFAHHUW',
        },
        customChains: [
            {
                network: 'linea_goerli',
                chainId: 59140,
                urls: {
                    apiURL: 'https://api-testnet.lineascan.build/api',
                    browserURL: 'https://goerli.lineascan.build',
                },
            },
            {
                network: 'linea_mainnet',
                chainId: 59144,
                urls: {
                    apiURL: 'https://api.lineascan.build/api',
                    browserURL: 'https://lineascan.build',
                },
            },
        ],
    },
    abiExporter: {
        runOnCompile: true,
        clear: true,
    },
    typechain: {
        outDir: 'types',
        target: 'ethers-v5',
        externalArtifacts: ['@pythnetwork/pyth-sdk-solidity/MockPyth.sol'],
    },
    dependencyCompiler: {
        paths: ['@pythnetwork/pyth-sdk-solidity/MockPyth.sol'],
    },
};
export default config;
