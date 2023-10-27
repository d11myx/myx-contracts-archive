import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { IPool } from '../types';

describe('Funding: funding rate calculator', () => {
    let testEnv: TestEnv;
    const pairIndex = 1;
    before(async () => {
        testEnv = await newTestEnv();
    });

    it('calculate funding rate', async () => {
        const { fundingRate, btc } = testEnv;

        const openPrice = ethers.utils.parseUnits('30000', 30);

        const vault: IPool.VaultStruct = {
            indexTotalAmount: ethers.utils.parseUnits('20', await btc.decimals()),
            indexReservedAmount: ethers.utils.parseUnits('0', await btc.decimals()),
            stableTotalAmount: BigNumber.from('30000').mul(ethers.utils.parseUnits('20', await btc.decimals())),
            stableReservedAmount: ethers.utils.parseUnits('0', await btc.decimals()),
            averagePrice: openPrice,
        };

        let longTracker = ethers.utils.parseUnits('1000', await btc.decimals());
        let shortTracker = ethers.utils.parseUnits('450', await btc.decimals());
        let rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('1860899');

        longTracker = ethers.utils.parseUnits('500', await btc.decimals());
        shortTracker = ethers.utils.parseUnits('500', await btc.decimals());
        rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('20000');

        longTracker = ethers.utils.parseUnits('0', await btc.decimals());
        shortTracker = ethers.utils.parseUnits('550', await btc.decimals());
        rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('-8776875');
    });
});
