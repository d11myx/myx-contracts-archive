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
        const { fundingRate } = testEnv;

        const openPrice = ethers.utils.parseUnits('30000', 30);

        const vault: IPool.VaultStruct = {
            indexTotalAmount: ethers.utils.parseUnits('20', 18),
            indexReservedAmount: ethers.utils.parseUnits('0', 18),
            stableTotalAmount: BigNumber.from('30000').mul(ethers.utils.parseUnits('20', 18)),
            stableReservedAmount: ethers.utils.parseUnits('0', 18),
            averagePrice: openPrice,
        };

        let longTracker = ethers.utils.parseUnits('1000', 18);
        let shortTracker = ethers.utils.parseUnits('450', 18);
        let rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('1860899');

        longTracker = ethers.utils.parseUnits('500', 18);
        shortTracker = ethers.utils.parseUnits('500', 18);
        rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('20000');

        longTracker = ethers.utils.parseUnits('0', 18);
        shortTracker = ethers.utils.parseUnits('550', 18);
        rate = await fundingRate.getFundingRate(pairIndex, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('-8776875');
    });
});
