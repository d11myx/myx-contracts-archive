import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { MAX_UINT_AMOUNT, TradeType } from '../helpers';
import { decreasePosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { TradingTypes } from '../types/contracts/core/Router';
import { TradingHelperMock } from '../types';
import { pool } from '../types/contracts';

describe('trading helper', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;
    let tradingHelperMock: TradingHelperMock;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;

        // update BTC Price
        await updateBTCPrice(testEnv, '30000');

        const TradingHelperMock = await ethers.getContractFactory('TradingHelperMock');
        tradingHelperMock = (await TradingHelperMock.deploy(pool.address)) as TradingHelperMock;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('100', 18);
        const stableAmount = ethers.utils.parseUnits('3000000', 18);
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    after(async () => {
        await updateBTCPrice(testEnv, '30000');
    });

    it('convertIndexAmountToStable', async () => {
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
        } = testEnv;
        let pair = await pool.getPair(pairIndex);
        expect(pair.indexToken).to.be.eq(btc.address);
        let stableAmount = await tradingHelperMock.convertIndexAmountToStable(
            '1',
            ethers.utils.parseUnits('1', await btc.decimals()),
        );
        expect(stableAmount).to.be.equal(ethers.utils.parseUnits('1', await usdt.decimals()));

        stableAmount = await tradingHelperMock.convertIndexAmountToStable(
            '1',
            ethers.utils.parseUnits('0.000001', await btc.decimals()),
        );
        expect(stableAmount).to.be.equal(ethers.utils.parseUnits('0.000001', await usdt.decimals()));
    });
});
