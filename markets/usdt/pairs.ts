import { PairInfoConfig } from '../../helpers';
import { ZERO_ADDRESS } from '../../helpers';
import { ethers } from 'ethers';

export const btcPairInfo: PairInfoConfig = {
    pairTokenDecimals: 8,
    useWrappedNativeToken: false,
    pair: {
        pairIndex: 1,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('4.4', 46),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 100000, //0.1%
        addLpFeeP: 100000, //0.1%
        removeLpFeeP: 300000, //0.3%
    },
    tradingConfig: {
        minLeverage: 1,
        maxLeverage: 50,
        minTradeAmount: ethers.utils.parseUnits('0.03', 8), //0.03
        maxTradeAmount: ethers.utils.parseUnits('15', 8), //35
        maxPositionAmount: ethers.utils.parseUnits('15', 8), //35
        maintainMarginRate: 1000000, //1%
        priceSlipP: 0, //0%
        maxPriceDeviationP: 200000, //0.2%
    },
    tradingFeeConfig: {
        takerFee: 70000, //0.07%
        makerFee: 45000, //0.045%
        lpFeeDistributeP: 40000000, //40%
        keeperFeeDistributeP: 1000000, //1%
        stakingFeeDistributeP: 0, //0%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 20000, //0.0002
        maxRate: 10000000, //0.1
        fundingInterval: 1 * 60 * 60,
    },
};

export const ethPairInfo: PairInfoConfig = {
    pairTokenDecimals: 18,
    useWrappedNativeToken: true,
    pair: {
        pairIndex: 2,
        indexToken: ZERO_ADDRESS,
        stableToken: ZERO_ADDRESS,
        pairToken: ZERO_ADDRESS,
        enable: true,
        kOfSwap: ethers.utils.parseUnits('4', 49),
        expectIndexTokenP: 50000000, //50%
        maxUnbalancedP: 10000000, //10%
        unbalancedDiscountRate: 100000, //0.1%
        addLpFeeP: 100000, //0.1%
        removeLpFeeP: 300000, //0.3%
    },
    tradingConfig: {
        minLeverage: 1,
        maxLeverage: 50,
        minTradeAmount: ethers.utils.parseUnits('0.5', 18), //0.5
        maxTradeAmount: ethers.utils.parseUnits('300', 18), //625
        maxPositionAmount: ethers.utils.parseUnits('300', 18), //625
        maintainMarginRate: 1000000, //1%
        priceSlipP: 0, //0%
        maxPriceDeviationP: 200000, //0.2%
    },
    tradingFeeConfig: {
        takerFee: 70000, //0.07%
        makerFee: 45000, //0.045%
        lpFeeDistributeP: 40000000, //40%
        keeperFeeDistributeP: 1000000, //1%
        stakingFeeDistributeP: 0, //0%
    },
    fundingFeeConfig: {
        growthRate: 2000000, //0.02
        baseRate: 20000, //0.0002
        maxRate: 10000000, //0.1
        fundingInterval: 1 * 60 * 60,
    },
};
