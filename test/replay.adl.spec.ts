import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers } from 'hardhat';
import { adlPosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';
import Decimal from 'decimal.js';
import { IExecutionLogic } from '../types';

describe('Replay: ADL', () => {
    const pairIndex = 0;

    describe('', () => {
        let testEnv: TestEnv;

        before(async () => {
            testEnv = await newTestEnv();
            const {
                btc,
                usdt,
                pool,
                router,
                users: [depositor],
            } = testEnv;

            await updateBTCPrice(testEnv, '27000');

            // add liquidity
            const depositAmount = await pool.getDepositAmount(pairIndex, ethers.utils.parseEther('500000'));
            const indexAmount = depositAmount.depositIndexAmount;
            const stableAmount = depositAmount.depositStableAmount;
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
            await router
                .connect(depositor.signer)
                .addLiquidity(depositor.address, pair.stableToken, indexAmount, stableAmount);
        });

        it('long tracker > short tracker, close long position', async () => {
            const {
                usdt,
                router,
                positionManager,
                users: [trader],
            } = testEnv;

            await mintAndApprove(testEnv, usdt, ethers.utils.parseEther('100000000'), trader, router.address);

            // at btc price of 26975.71, open long 9.2282
            await updateBTCPrice(testEnv, '26975.71');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                ethers.utils.parseEther('1000000'),
                ethers.utils.parseUnits('26982.4', 30),
                ethers.utils.parseEther('9.2282'),
                TradeType.MARKET,
                true,
            );

            // at btc price of 26987.41, open short 18.1643
            await updateBTCPrice(testEnv, '26987.41');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                ethers.utils.parseEther('1000000'),
                ethers.utils.parseUnits('26975.97', 30),
                ethers.utils.parseEther('18.1643'),
                TradeType.MARKET,
                false,
            );

            // at btc price of 26984.56, open long 18.1565
            await updateBTCPrice(testEnv, '26984.56');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseUnits('26987.56', 30),
                ethers.utils.parseEther('18.1565'),
                TradeType.MARKET,
                true,
            );

            const userLongPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
            // console.log(userLongPositionBefore);
            const userShortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
            // console.log(userShortPositionBefore);
            expect(userLongPositionBefore.positionAmount).to.be.eq(
                ethers.utils.parseEther(new Decimal('9.2282').add('18.1565').toString()),
            );
            expect(userShortPositionBefore.positionAmount).to.be.eq(ethers.utils.parseEther('18.1643'));

            const needADL = await positionManager.needADL(
                pairIndex,
                true,
                ethers.utils.parseEther('27.3847'),
                ethers.utils.parseUnits('26981.38', 30),
            );
            expect(needADL.needADL).to.be.true;

            // at btc price of 26981.38, close long 27.022
            await updateBTCPrice(testEnv, '26981.38');
            const adlPositionKey = await positionManager.getPositionKey(trader.address, pairIndex, false);
            const adlPositions: IExecutionLogic.ExecutePositionStruct[] = [
                { positionKey: adlPositionKey, sizeAmount: needADL.needADLAmount, level: 0, commissionRatio: 0 },
            ];
            const { executeReceipt } = await adlPosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseEther('27.3847'),
                ethers.utils.parseUnits('26981.38', 30),
                TradeType.MARKET,
                true,
                adlPositions,
            );
            // await hre.run('decode-event', { hash: executeReceipt.transactionHash, log: false });
            const userLongPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const userShortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(userLongPositionAfter.positionAmount).to.be.eq(0);
        });
    });

    describe('', () => {
        let testEnv: TestEnv;

        before(async () => {
            testEnv = await newTestEnv();
            const {
                btc,
                usdt,
                pool,
                router,
                users: [depositor],
            } = testEnv;

            await updateBTCPrice(testEnv, '27000');

            // add liquidity
            const depositAmount = await pool.getDepositAmount(pairIndex, ethers.utils.parseEther('500000'));
            const indexAmount = depositAmount.depositIndexAmount;
            const stableAmount = depositAmount.depositStableAmount;
            const pair = await pool.getPair(pairIndex);
            await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
            await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
            await router
                .connect(depositor.signer)
                .addLiquidity(depositor.address, pair.stableToken, indexAmount, stableAmount);
        });

        it('long tracker > short tracker, close long position', async () => {
            const {
                usdt,
                router,
                pool,
                positionManager,
                users: [, trader],
            } = testEnv;

            await mintAndApprove(testEnv, usdt, ethers.utils.parseEther('100000000'), trader, router.address);

            // at btc price of 27603.32, open short
            await updateBTCPrice(testEnv, '27603.32');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                ethers.utils.parseEther('1000000'),
                ethers.utils.parseUnits('27601.91', 30),
                await calculateOpenSize(testEnv, false),
                TradeType.MARKET,
                false,
            );

            // at btc price of 27599.58, open short
            await updateBTCPrice(testEnv, '27599.58');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                ethers.utils.parseEther('1000000'),
                ethers.utils.parseUnits('27603.13', 30),
                await calculateOpenSize(testEnv, true),
                TradeType.MARKET,
                true,
            );

            // at btc price of 27604.3, open short
            await updateBTCPrice(testEnv, '27604.3');
            await increasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                ethers.utils.parseUnits('27606.46', 30),
                await calculateOpenSize(testEnv, false),
                TradeType.MARKET,
                false,
            );

            const userLongPosition = await positionManager.getPosition(trader.address, pairIndex, true);
            const userShortPosition = await positionManager.getPosition(trader.address, pairIndex, false);

            const needADL = await positionManager.needADL(
                pairIndex,
                false,
                userShortPosition.positionAmount,
                ethers.utils.parseUnits('26981.38', 30),
            );
            expect(needADL.needADL).to.be.true;

            // at btc price of 26981.38, close short
            await updateBTCPrice(testEnv, '26981.38');
            const adlPositionKey = await positionManager.getPositionKey(trader.address, pairIndex, true);
            const adlPositions: IExecutionLogic.ExecutePositionStruct[] = [
                { positionKey: adlPositionKey, sizeAmount: needADL.needADLAmount, level: 0, commissionRatio: 0 },
            ];
            const { executeReceipt } = await adlPosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                userShortPosition.positionAmount,
                ethers.utils.parseUnits('26981.38', 30),
                TradeType.MARKET,
                false,
                adlPositions,
            );
            // await hre.run('decode-event', { hash: executeReceipt.transactionHash, log: false });
            const userLongPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
            const userShortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
            expect(userShortPositionAfter.positionAmount).to.be.eq(0);
        });
    });

    async function calculateOpenSize(testEnv: TestEnv, isLong: boolean): Promise<string> {
        const { pool, priceOracle, btc } = testEnv;

        const pairPrice = new Decimal(ethers.utils.formatUnits(await priceOracle.getOraclePrice(btc.address), 30));

        const vault = await pool.getVault(pairIndex);
        if (isLong) {
            return new Decimal(vault.indexTotalAmount.toString())
                .sub(vault.indexReservedAmount.toString())
                .add(new Decimal(vault.stableReservedAmount.toString()).div(pairPrice).toString())
                .toFixed(0, Decimal.ROUND_DOWN);
        } else {
            return new Decimal(vault.stableTotalAmount.toString())
                .sub(vault.stableReservedAmount.toString())
                .div(pairPrice)
                .add(vault.indexReservedAmount.toString())
                .toFixed(0, Decimal.ROUND_DOWN);
        }
    }
});
