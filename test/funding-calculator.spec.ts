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
        const { fundingRate, btc, usdt, pool } = testEnv;

        const openPrice = ethers.utils.parseUnits('30000', 30);

        const vault: IPool.VaultStruct = {
            indexTotalAmount: ethers.utils.parseUnits('20', await btc.decimals()),
            indexReservedAmount: ethers.utils.parseUnits('0', await btc.decimals()),
            stableTotalAmount: BigNumber.from('30000').mul(ethers.utils.parseUnits('20', await usdt.decimals())),
            stableReservedAmount: ethers.utils.parseUnits('0', await usdt.decimals()),
            averagePrice: openPrice,
        };

        const pair = await pool.getPair(pairIndex);

        let longTracker = ethers.utils.parseUnits('1000', await btc.decimals());
        let shortTracker = ethers.utils.parseUnits('450', await btc.decimals());
        let rate = await fundingRate.getFundingRate(pair, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('6113309');

        longTracker = ethers.utils.parseUnits('500', await btc.decimals());
        shortTracker = ethers.utils.parseUnits('500', await btc.decimals());
        rate = await fundingRate.getFundingRate(pair, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('20000');

        longTracker = ethers.utils.parseUnits('0', await btc.decimals());
        shortTracker = ethers.utils.parseUnits('550', await btc.decimals());
        rate = await fundingRate.getFundingRate(pair, longTracker, shortTracker, vault, openPrice);
        expect(rate).to.be.eq('-28962638');
    });
});
