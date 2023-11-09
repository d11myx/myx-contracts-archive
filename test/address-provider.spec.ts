import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { expect } from './shared/expect';
import { getMockToken, ZERO_ADDRESS } from '../helpers';
import { BigNumber, constants } from 'ethers';
import Decimal from 'decimal.js';
import { convertIndexAmount, convertStableAmount } from '../helpers/token-decimals';

describe('LP: fair price', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;

        // add liquidity
        // const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
        // const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
        // const pair = await pool.getPair(pairIndex);
        // await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        // await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        // await router
        //     .connect(depositor.signer)
        //     .addLiquidity(
        //         pair.indexToken,
        //         pair.stableToken,
        //         0,
        //         0,
        //         [pair.indexToken],
        //         [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
        //         { value: 1 },
        //     );
    });

    it('Checks the addresses provider is added to the registry', async () => {
        const { addressesProvider } = testEnv;

        // const providers = await registry.getAddressesProvidersList();

        // expect(providers.length).to.be.equal(1, 'Invalid length of the addresses providers list');
        // expect(providers[0].toString()).to.be.equal(
        //     addressesProvider.address,
        //     'Invalid addresses provider added to the list'
        // );
    });
});
