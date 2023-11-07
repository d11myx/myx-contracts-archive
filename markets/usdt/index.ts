import {
    DevNetwork,
    EthereumNetwork,
    LineaNetwork,
    ReserveConfiguration,
    ScrollNetwork,
    ZERO_ADDRESS,
    ZERO_HASH,
} from '../../helpers';
import { btcPairInfo, ethPairInfo } from './pairs';

export const USDTMarketConfig: ReserveConfiguration = {
    MarketTokenSymbol: 'USDT',
    MarketTokenName: 'Tether',
    MarketTokenDecimals: 6,
    MarketTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: '0xa219439258ca9da29e9cc4ce5596924745e12b93',
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
    },
    WrapperTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
    },

    PairsConfig: {
        WBTC: btcPairInfo,
        WETH: ethPairInfo,
    },
    PairAssets: {
        [DevNetwork.local]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [LineaNetwork.goerli]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [LineaNetwork.main]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [ScrollNetwork.sepolia]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [ScrollNetwork.main]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
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
    OraclePriceId: {
        [DevNetwork.local]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [LineaNetwork.goerli]: {
            WBTC: '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
            WETH: '0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6',
        },
        [LineaNetwork.main]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [ScrollNetwork.sepolia]: {
            WBTC: '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
            WETH: '0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6',
        },
        [ScrollNetwork.main]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
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
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [LineaNetwork.goerli]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [LineaNetwork.main]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [ScrollNetwork.sepolia]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [ScrollNetwork.main]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
    },
};

export default USDTMarketConfig;
