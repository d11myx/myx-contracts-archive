import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { adlPosition, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { TradeType } from '../helpers';
import Decimal from 'decimal.js';
import { IExecutionLogic } from '../types';

describe('Replay: ADL', () => {
    const pairIndex = 0;
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
            btc,
            usdt,
            pool,
            router,
            priceOracle,
            positionManager,
            executionLogic,
            users: [trader],
        } = testEnv;

        const pairPrice = BigNumber.from(
            ethers.utils.formatUnits(await priceOracle.getOraclePrice(btc.address), 30).replace('.0', ''),
        );

        const vault = await pool.getVault(pairIndex);
        console.log(vault);
        const availableIndex = vault.indexTotalAmount.sub(vault.indexReservedAmount);
        const availableStable = vault.stableTotalAmount.sub(vault.stableReservedAmount);
        console.log(availableIndex.mul(pairPrice).add(availableStable));

        await mintAndApprove(testEnv, usdt, ethers.utils.parseEther('100000000'), trader, router.address);

        console.log(1);
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
        console.log(2);

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
        console.log(3);

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
        console.log(4);

        const userLongPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log(userLongPositionBefore);
        const userShortPositionBefore = await positionManager.getPosition(trader.address, pairIndex, false);
        // console.log(userShortPositionBefore);
        expect(userLongPositionBefore.positionAmount).to.be.eq(
            ethers.utils.parseEther(new Decimal('9.2282').add('18.1565').toString()),
        );
        expect(userShortPositionBefore.positionAmount).to.be.eq(ethers.utils.parseEther('18.1643'));

        console.log(`getVault:`, await pool.getVault(pairIndex));
        console.log(`getExposedPositions:`, await positionManager.getExposedPositions(pairIndex));

        const needADL = await positionManager.needADL(
            pairIndex,
            true,
            ethers.utils.parseEther('27.3847'),
            ethers.utils.parseUnits('26981.38', 30),
        );
        console.log(`needADL:`, needADL);
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
        await hre.run('decode-event', { hash: executeReceipt.transactionHash, log: false });
        const userLongPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
        console.log(userLongPositionAfter);
        const userShortPositionAfter = await positionManager.getPosition(trader.address, pairIndex, false);
        console.log(userShortPositionAfter);

        // ======1 0.038859259259259259
        // ======1 18.488766925655794106

        // ======2 18.527626184915053364
        // ======2 0.005524011710172430

        // ======3 9.631693110570847471
        // ======3 8.903592109992220933

        // ======4 18.527626184915053364
        // ======4 0.008993425609166670
    });
});
