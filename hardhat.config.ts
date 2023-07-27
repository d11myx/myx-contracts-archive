import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@openzeppelin/hardhat-upgrades';
// import "@matterlabs/hardhat-zksync-deploy";
// import "@matterlabs/hardhat-zksync-solc";
// import "@matterlabs/hardhat-zksync-verify";
import '@nomiclabs/hardhat-ethers';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'solidity-coverage';

dotenv.config();

const LOCAL_PRIVATE_KEY1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const LOCAL_PRIVATE_KEY2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const LOCAL_PRIVATE_KEY3 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const LOCAL_PRIVATE_KEY4 = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
const LOCAL_PRIVATE_KEY5 = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const LOCAL_PRIVATE_KEY6 = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
const LOCAL_PRIVATE_KEY7 = '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e';
const LOCAL_PRIVATE_KEY8 = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356';
const LOCAL_PRIVATE_KEY9 = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97';
const LOCAL_PRIVATE_KEY10 = '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6';
const LOCAL_PRIVATE_KEY11 = '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897';
const LOCAL_PRIVATE_KEY12 = '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82';
const LOCAL_PRIVATE_KEY13 = '0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1';
const LOCAL_PRIVATE_KEY14 = '0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd';
const LOCAL_PRIVATE_KEY15 = '0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa';
const LOCAL_PRIVATE_KEY16 = '0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61';
const LOCAL_PRIVATE_KEY17 = '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0';
const LOCAL_PRIVATE_KEY18 = '0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd';
const LOCAL_PRIVATE_KEY19 = '0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0';
const LOCAL_PRIVATE_KEY20 = '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e';

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

const gas = 'auto';
const gasPrice = 'auto';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 20,
      },
      viaIR: true,
    },
  },
//   defaultNetwork: "local",
  // zksolc: {
  //   version: "1.3.8",
  //   compilerSource: "binary",
  //   settings: {
  //     libraries: {}, // optional. References to non-inlinable libraries
  //     isSystem: false, // optional.  Enables Yul instructions available only for zkSync system contracts and libraries
  //     forceEvmla: false, // optional. Falls back to EVM legacy assembly if there is a bug with Yul
  //     optimizer: {
  //       enabled: true, // optional. True by default
  //       mode: '3' // optional. 3 by default, z to optimize bytecode size
  //     }
  //   }
  // },
  networks: {
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
        LOCAL_PRIVATE_KEY20
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
        LOCAL_PRIVATE_KEY20
      ],
      // gas: gas,
      // gasPrice: gasPrice
    },
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
