import {
    ArbitrumNetwork,
    DevNetwork,
    EthereumNetwork,
    LineaNetwork,
    ReserveConfiguration,
    ScrollNetwork,
    ZERO_ADDRESS,
    ZERO_HASH,
} from '../../helpers';
import { btcPairInfo, ethPairInfo } from './pairs';

export const USDCMarketConfig: ReserveConfiguration = {
    MarketTokenSymbol: 'USDC',
    MarketTokenName: 'USD Coin',
    MarketTokenDecimals: 6,
    MarketTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: '0xa219439258ca9da29e9cc4ce5596924745e12b93',
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
        [ArbitrumNetwork.sepolia]: ZERO_ADDRESS,
        [ArbitrumNetwork.main]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    WrapperTokenAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        [LineaNetwork.goerli]: ZERO_ADDRESS,
        [LineaNetwork.main]: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
        [ScrollNetwork.sepolia]: ZERO_ADDRESS,
        [ScrollNetwork.main]: ZERO_ADDRESS,
        [ArbitrumNetwork.sepolia]: ZERO_ADDRESS,
        [ArbitrumNetwork.main]: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
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
            WBTC: '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4',
            WETH: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
        },
        [ScrollNetwork.sepolia]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [ScrollNetwork.main]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [ArbitrumNetwork.sepolia]: {
            WBTC: ZERO_ADDRESS,
            WETH: ZERO_ADDRESS,
        },
        [ArbitrumNetwork.main]: {
            WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
            WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        },
    },
    ExecuteOrderTimeDelay: 60 * 5,
    OraclePriceFeedAddress: {
        [DevNetwork.local]: ZERO_ADDRESS,
        [EthereumNetwork.goerli]: ZERO_ADDRESS,
        [EthereumNetwork.main]: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
        [LineaNetwork.goerli]: '0xdF21D137Aadc95588205586636710ca2890538d5',
        [LineaNetwork.main]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
        [ScrollNetwork.sepolia]: '0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c',
        [ScrollNetwork.main]: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
        [ArbitrumNetwork.sepolia]: '0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF',
        [ArbitrumNetwork.main]: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
    },
    OraclePriceId: {
        [DevNetwork.local]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [LineaNetwork.goerli]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [LineaNetwork.main]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [ScrollNetwork.sepolia]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [ScrollNetwork.main]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [ArbitrumNetwork.sepolia]: {
            WBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            WETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
        [ArbitrumNetwork.main]: {
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
        [ArbitrumNetwork.sepolia]: ZERO_ADDRESS,
        [ArbitrumNetwork.main]: ZERO_ADDRESS,
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
        [ArbitrumNetwork.sepolia]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
        [ArbitrumNetwork.main]: {
            WBTC: ZERO_HASH,
            WETH: ZERO_HASH,
        },
    },
};

export default USDCMarketConfig;
