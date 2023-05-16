import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import '@openzeppelin/hardhat-upgrades';
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import "@nomiclabs/hardhat-ethers";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";

dotenv.config();

const LOCAL_PRIVATE_KEY1 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const LOCAL_PRIVATE_KEY2 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const LOCAL_PRIVATE_KEY3 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const LOCAL_PRIVATE_KEY4 = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

const gas = "auto";
const gasPrice = "auto";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.13",
      },
    ],
  },
  defaultNetwork: "local",
  zksolc: {
    version: "1.3.8",
    compilerSource: "binary",
    settings: {
      libraries: {}, // optional. References to non-inlinable libraries
      isSystem: false, // optional.  Enables Yul instructions available only for zkSync system contracts and libraries
      forceEvmla: false, // optional. Falls back to EVM legacy assembly if there is a bug with Yul
      optimizer: {
        enabled: true, // optional. True by default
        mode: '3' // optional. 3 by default, z to optimize bytecode size
      }
    }
  },
  networks: {
    local: {
      url: "http://127.0.0.1:8545/",
      accounts:
          [LOCAL_PRIVATE_KEY1, LOCAL_PRIVATE_KEY2, LOCAL_PRIVATE_KEY3, LOCAL_PRIVATE_KEY4],
      gas: gas,
      gasPrice: gasPrice,
    },
    zkTestnet: {
      url: "https://testnet.era.zksync.dev", // The testnet RPC URL of zkSync Era network.
      accounts:
          ["23ff91c240901be006ec8e4fc52f9a3be3a08496be8d25a1fa1fe00c147fbc3e"],
      ethNetwork: "goerli", // The Ethereum Web3 RPC URL, or the identifier of the network (e.g. `mainnet` or `goerli`)
      zksync: true,
      verifyURL: 'https://zksync2-testnet-explorer.zksync.dev/contract_verification'
    },
    zk: {
      url: "https://zksync2-mainnet.zksync.io", // The testnet RPC URL of zkSync Era network.
      accounts:
          ["23ff91c240901be006ec8e4fc52f9a3be3a08496be8d25a1fa1fe00c147fbc3e"],
      ethNetwork: "mainnet", // The Ethereum Web3 RPC URL, or the identifier of the network (e.g. `mainnet` or `goerli`)
      zksync: true,
      verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
    } as any,
  },
  etherscan: {
    apiKey: "M5SDQD75WPPKN8XTUZM86BE46VAGUEBCE8",
  },
  abiExporter: {
    runOnCompile: true,
    clear: true
  }
};
export default config;
