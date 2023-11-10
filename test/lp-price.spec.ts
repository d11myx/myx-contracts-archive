import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { BigNumberish, ethers } from 'ethers';
import { IPool } from '../types';

describe('LP: Price cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv, pair: IPool.PairStructOutput;

    before(async () => {
        testEnv = await newTestEnv();
        const { pool } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        pair = await pool.getPair(pairIndex);
    });

    it('lp price(1)', async () => {
        const {
            users: [depositor],
        } = testEnv;

        expect(await _lpPrice()).to.be.eq(ethers.utils.parseUnits('1', 30));

        const expectLPAmount = ethers.utils.parseUnits('10000', 18);
        await _balancedAddLiquidity(expectLPAmount, depositor);

        expect(await _lpPrice()).to.be.eq(ethers.utils.parseUnits('1', 30));
    });

    it('lp price(2)', async () => {
        const {
            users: [depositor],
        } = testEnv;

        expect(await _lpPrice()).to.be.eq(ethers.utils.parseUnits('1', 30));

        await updateBTCPrice(testEnv, '29800');

        console.log(ethers.utils.formatUnits(await _lpPrice(), 30));

        const expectLPAmount = ethers.utils.parseUnits('10000', 18);
        await _balancedAddLiquidity(expectLPAmount, depositor);

        console.log(ethers.utils.formatUnits(await _lpPrice(), 30));
    });

    async function _balancedAddLiquidity(expectLPAmount: BigNumberish, depositor: SignerWithAddress) {
        const { pool, oraclePriceFeed, btc, usdt, router } = testEnv;

        const oraclePrice = await oraclePriceFeed.getPrice(btc.address);

        const { depositIndexAmount, depositStableAmount } = await pool.getDepositAmount(
            pairIndex,
            expectLPAmount,
            oraclePrice,
        );

        await mintAndApprove(testEnv, btc, depositIndexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, depositStableAmount, depositor, router.address);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                depositIndexAmount,
                depositStableAmount,
                [btc.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [oraclePrice.div('10000000000000000000000')])],
                { value: 1 },
            );

        return { depositIndexAmount, depositStableAmount };
    }

    async function _lpPrice() {
        const { pool, oraclePriceFeed, btc } = testEnv;
        return await pool.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
    }
});
