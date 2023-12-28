import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { BigNumberish, ethers } from 'ethers';
import { IPool, PoolToken } from '../types';
import { convertIndexAmount, convertStableAmount, getPoolToken } from '../helpers';
import Decimal from 'decimal.js';

describe('LP: Price cases', () => {
    const pairIndex = 1,
        pricePrecision = '1000000000000000000000000000000';
    let testEnv: TestEnv, pair: IPool.PairStructOutput, lpToken: PoolToken;

    before(async () => {
        testEnv = await newTestEnv();
        const { pool } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        pair = await pool.getPair(pairIndex);
        lpToken = await getPoolToken(pair.pairToken);
    });

    it('init add liquidity', async () => {
        const {
            users: [depositor],
        } = testEnv;
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed()).to.be.eq('1');

        const expectLPAmount = ethers.utils.parseUnits('10000', 18);
        await _addLiquidity(expectLPAmount, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed()).to.be.eq('1');
    });

    it('remove all liquidity after price changed', async () => {
        const {
            users: [depositor],
        } = testEnv;
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed()).to.be.eq('1');

        await updateBTCPrice(testEnv, '20000');
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('0.83333');

        await _removeLiquidity(await _maxRemoveLiquidityAmount(), depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed()).to.be.eq('1');
    });

    it('multiple add liquidity', async () => {
        const {
            users: [depositor],
        } = testEnv;
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        const expectLPAmount1 = ethers.utils.parseUnits('10000', 18);
        await _addLiquidity(expectLPAmount1, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        const expectLPAmount2 = ethers.utils.parseUnits('100', 18);
        await _addLiquidity(expectLPAmount2, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        await updateBTCPrice(testEnv, '25000');
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.12500');

        const expectLPAmount3 = ethers.utils.parseUnits('10000', 18);
        await _removeLiquidity(expectLPAmount3, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.12500');

        const expectLPAmount4 = ethers.utils.parseUnits('10000000000', 18);
        await _addLiquidity(expectLPAmount4, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.12500');

        const expectLPAmount5 = ethers.utils.parseUnits('10000000000', 18);
        await _removeLiquidity(expectLPAmount5, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.12500');

        await _removeLiquidity((await _maxRemoveLiquidityAmount()).sub(ethers.utils.parseUnits('1', 18)), depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.12525');

        await _removeLiquidity(await _maxRemoveLiquidityAmount(), depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');
    });

    it('test unbalanced, index > stable', async () => {
        const {
            oraclePriceFeed,
            pool,
            btc,
            usdt,
            router,
            users: [depositor],
        } = testEnv;
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        const expectLPAmount1 = ethers.utils.parseUnits('10000', 18);
        await _addLiquidity(expectLPAmount1, depositor);
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        // only deposit index token
        const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);
        const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                0,
                [pair.indexToken],
                [new ethers.utils.AbiCoder().encode(['uint256'], [oraclePrice.div('10000000000000000000000')])],
                { value: 1 },
            );

        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');

        await updateBTCPrice(testEnv, '20000');
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('0.80004');

        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                0,
                [pair.indexToken],
                [new ethers.utils.AbiCoder().encode(['uint256'], [oraclePrice.div('10000000000000000000000')])],
                { value: 1 },
            );
        expect(new Decimal((await _lpPrice()).toString()).div(pricePrecision).toFixed(5)).to.be.eq('1.00000');
    });

    async function _maxRemoveLiquidityAmount() {
        const { pool } = await _liquidityDelta();

        return pool.mul(pricePrecision).div(await _lpPrice());
    }

    async function _liquidityDelta() {
        const { pool, btc, usdt, oraclePriceFeed } = testEnv;
        const { indexTotalAmount, indexReservedAmount, stableTotalAmount, stableReservedAmount } =
            await pool.getVault(pairIndex);

        const indexDeltaWad = (await convertIndexAmount(btc, indexTotalAmount.sub(indexReservedAmount), 18))
            .mul(await oraclePriceFeed.getPrice(pair.indexToken))
            .div(pricePrecision);
        const stableDeltaWad = await convertStableAmount(usdt, stableTotalAmount.sub(stableReservedAmount), 18);

        return {
            index: indexDeltaWad,
            stable: stableDeltaWad,
            pool: indexDeltaWad.add(stableDeltaWad),
            lp: (await lpToken.totalSupply()).mul(await _lpPrice()).div(pricePrecision),
        };
    }

    async function _removeLiquidity(lpAmount: BigNumberish, user: SignerWithAddress) {
        const { oraclePriceFeed, router } = testEnv;
        const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);

        await lpToken.connect(user.signer).approve(router.address, lpAmount);

        await router
            .connect(user.signer)
            .removeLiquidity(
                pair.indexToken,
                pair.stableToken,
                lpAmount,
                false,
                [pair.indexToken],
                [new ethers.utils.AbiCoder().encode(['uint256'], [oraclePrice.div('10000000000000000000000')])],
                { value: 1 },
            );
    }

    async function _addLiquidity(expectLPAmount: BigNumberish, user: SignerWithAddress) {
        const { pool, poolView, oraclePriceFeed, btc, usdt, router } = testEnv;

        const oraclePrice = await oraclePriceFeed.getPrice(pair.indexToken);

        const { depositIndexAmount, depositStableAmount } = await poolView.getDepositAmount(
            pairIndex,
            expectLPAmount,
            oraclePrice,
        );

        await mintAndApprove(testEnv, btc, depositIndexAmount, user, router.address);
        await mintAndApprove(testEnv, usdt, depositStableAmount, user, router.address);
        await router
            .connect(user.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                depositIndexAmount,
                depositStableAmount,
                [pair.indexToken],
                [new ethers.utils.AbiCoder().encode(['uint256'], [oraclePrice.div('10000000000000000000000')])],
                { value: 1 },
            );

        return { depositIndexAmount, depositStableAmount };
    }

    async function _lpPrice() {
        const { pool, poolView, oraclePriceFeed, btc } = testEnv;
        return await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
    }
});
