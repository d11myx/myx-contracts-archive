import {
    DevNetwork,
    EthereumNetwork,
    LineaNetwork,
    ReserveConfiguration,
    ScrollNetwork,
    ZERO_ADDRESS,
} from '../../helpers';
import { btcPairInfo, ethPairInfo } from './pairs';

export const USDTMarketConfig: ReserveConfiguration = {
    MarketTokenSymbol: 'USDT',
    MarketTokenName: 'Tether',
    MarketTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: ZERO_ADDRESS,
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: ZERO_ADDRESS,
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
    },
    WrapperTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: ZERO_ADDRESS,
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: ZERO_ADDRESS,
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
    },

    PairsConfig: {
        BTC: btcPairInfo,
        ETH: ethPairInfo,
    },
    PairAssets: {
        [DevNetwork.local]: {
            BTC: ZERO_ADDRESS,
            ETH: ZERO_ADDRESS,
        },
        [LineaNetwork.goerli]: {
            BTC: ZERO_ADDRESS,
            ETH: ZERO_ADDRESS,
        },
        [LineaNetwork.main]: {
            BTC: ZERO_ADDRESS,
            ETH: ZERO_ADDRESS,
        },
        [ScrollNetwork.sepolia]: {
            BTC: ZERO_ADDRESS,
            ETH: ZERO_ADDRESS,
        },
        [ScrollNetwork.main]: {
            BTC: ZERO_ADDRESS,
            ETH: ZERO_ADDRESS,
        },
    },
    ExecuteOrderTimeDelay: 60 * 5,
    OraclePriceFeedAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
        [EthereumNetwork.main]: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
        [LineaNetwork.goerli]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
        [LineaNetwork.main]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
        [ScrollNetwork.sepolia]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
        [ScrollNetwork.main]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
    },
    UniswapRouterAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: ZERO_ADDRESS,
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: ZERO_ADDRESS,
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
    },
    UniswapTokenPathConfig: {
        [DevNetwork.local]: {
            BTC: '0x',
            ETH: '0x',
        },
        [LineaNetwork.goerli]: {
            BTC: '0x',
            ETH: '0x',
        },
        [LineaNetwork.main]: {
            BTC: '0x',
            ETH: '0x',
        },
        [ScrollNetwork.sepolia]: {
            BTC: '0x',
            ETH: '0x',
        },
        [ScrollNetwork.main]: {
            BTC: '0x',
            ETH: '0x',
        },
    },
};

export default USDTMarketConfig;
