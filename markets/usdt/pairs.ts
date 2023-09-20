import { PairInfoConfig } from '../../helpers';
import { ZERO_ADDRESS } from '../../helpers';
import { ethers } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
    pair: {
        pairIndex: 0,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 10000000, //10%
        addLpFeeP: 100000, //0.1%
        removeLpFeeP: 100000, //0.1%
        lpFeeDistributeP: 100000000,
    },
    tradingConfig: {
        minLeverage: 3,
        maxLeverage: 50,
        minTradeAmount: '10000000000000000', //0.01
        maxTradeAmount: '10000000000000000000000', //10000
        maxPositionAmount: '1000000000000000000000000', //1000000
        maintainMarginRate: 1000000, //1%
        priceSlipP: 100000, //0.1%
        maxPriceDeviationP: 500000, //0.5%
    },
    tradingFeeConfig: {
        takerFeeP: 80000, //0.08%
        makerFeeP: 50000, //0.05%
        lpFeeDistributeP: 30000000, //30%
        keeperFeeDistributeP: 20000000, //20%
        stakingFeeDistributeP: 10000000, //10%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 20000, //0.0002
        maxRate: 10000000, //0.1
        fundingInterval: 60 * 60,
    },
};

export const ethPairInfo: PairInfoConfig = {
    pair: {
        pairIndex: 1,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('1', 50),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 10000000, //10%
        addLpFeeP: 100000, //0.1%
        removeLpFeeP: 100000, //0.1%
        lpFeeDistributeP: 100000000,
    },
    tradingConfig: {
        minLeverage: 3,
        maxLeverage: 50,
        minTradeAmount: '100000000000000000', //0.1
        maxTradeAmount: '10000000000000000000000', //10000
        maxPositionAmount: '1000000000000000000000000', //1000000
        maintainMarginRate: 1000000, //1%
        priceSlipP: 100000, //0.1%
        maxPriceDeviationP: 500000, //0.5%
    },
    tradingFeeConfig: {
        takerFeeP: 80000, //0.08%
        makerFeeP: 50000, //0.05%
        lpFeeDistributeP: 30000000, //30%
        keeperFeeDistributeP: 20000000, //20%
        stakingFeeDistributeP: 10000000, //10%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 20000, //0.0002
        maxRate: 10000000, //0.1
        fundingInterval: 60 * 60,
    },
};
