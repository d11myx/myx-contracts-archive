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

        const openPrice = ethers.utils.parseUnits('1', 30);

        const vault: IPool.VaultStruct = {
            indexTotalAmount: ethers.utils.parseUnits('500', await btc.decimals()),
            indexReservedAmount: ethers.utils.parseUnits('0', await btc.decimals()),
            stableTotalAmount: BigNumber.from('1').mul(ethers.utils.parseUnits('500', await usdt.decimals())),
            stableReservedAmount: ethers.utils.parseUnits('0', await usdt.decimals()),
            averagePrice: openPrice,
        };

        const pair = await pool.getPair(pairIndex);

        // long = short
        let rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('833');

        vault.indexReservedAmount = ethers.utils.parseUnits('1000', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('450', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('142916');

        vault.indexReservedAmount = ethers.utils.parseUnits('850', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('465', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('89704');

        vault.indexReservedAmount = ethers.utils.parseUnits('690', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('481', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('42946');

        vault.indexReservedAmount = ethers.utils.parseUnits('680', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('482', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('40367');

        vault.indexReservedAmount = ethers.utils.parseUnits('600', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('490', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('21183');

        vault.indexReservedAmount = ethers.utils.parseUnits('500', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('500', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('833');

        vault.indexReservedAmount = ethers.utils.parseUnits('490', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('501', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('-979');

        vault.indexReservedAmount = ethers.utils.parseUnits('340', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('516', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('-23337');

        vault.indexReservedAmount = ethers.utils.parseUnits('0', await btc.decimals());
        vault.stableReservedAmount = ethers.utils.parseUnits('550', await usdt.decimals());
        rate = await fundingRate.getFundingRate(pair, vault, openPrice);
        expect(rate).to.be.eq('-40416');
    });
});
