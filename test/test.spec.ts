import { newTestEnv, testEnv, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { increasePosition, mintAndApprove, updateBTCPrice, updateETHPrice } from './helpers/misc';
import { expect } from './shared/expect';
import { TradeType, getMockToken, convertIndexAmountToStable, ZERO_ADDRESS, abiCoder } from '../helpers';
import { BigNumber, constants } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';
import usdt from '../markets/usdt';
import { pool } from '../types/contracts';

describe('Trade: adl', () => {
    const pairIndex = 2;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();

        const {
            users: [depositor],
            eth,
            usdt,
            pool,
            router,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('4.5', await eth.decimals());
        const stableAmount = ethers.utils.parseUnits('2000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, eth, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [eth.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                { value: 1 },
            );
    });

    it('11', async () => {
        const {
            pool,
            router,
            executor,
            usdt,
            keeper,
            orderManager,
            indexPriceFeed,
            oraclePriceFeed,
            eth,
            positionManager,
            users: [trader],
        } = testEnv;

        console.log(await pool.getVault(2));

        await mintAndApprove(
            testEnv,
            usdt,
            ethers.utils.parseUnits('100000000', await usdt.decimals()),
            trader,
            router.address,
        );

        // at btc price of 27603.32, open short
        await updateETHPrice(testEnv, '1010.23');
        await increasePosition(
            testEnv,
            trader,
            pairIndex,
            ethers.utils.parseUnits('10000', await usdt.decimals()),
            ethers.utils.parseUnits('1010.23', 30),
            ethers.utils.parseUnits('4.9656', 18),
            TradeType.MARKET,
            false,
        );

        await increasePosition(
            testEnv,
            trader,
            pairIndex,
            ethers.utils.parseUnits('10000', await usdt.decimals()),
            ethers.utils.parseUnits('1010.23', 30),
            ethers.utils.parseUnits('2.4824', 18),
            TradeType.MARKET,
            true,
        );

        await increasePosition(
            testEnv,
            trader,
            pairIndex,
            ethers.utils.parseUnits('10000', await usdt.decimals()),
            ethers.utils.parseUnits('1010.23', 30),
            ethers.utils.parseUnits('4.9656', 18),
            TradeType.MARKET,
            false,
        );

        console.log(await positionManager.getPosition(trader.address, pairIndex, false));
        console.log(await positionManager.getPosition(trader.address, pairIndex, true));
        console.log(await pool.getVault(2));

        await pool.updateChange(true);

        console.log(
            await positionManager.needADL(2, true, '2482400000000000000', '2010857500000000000000000000000000'),
        );

        // console.log(await positionManager.getPosition(trader.address, pairIndex, true));

        const request: TradingTypes.DecreasePositionRequestStruct = {
            account: trader.address,
            collateral: 0,
            isLong: true,
            maxSlippage: 0,
            pairIndex: pairIndex,
            sizeAmount: ethers.utils.parseUnits('2.4824', 18),
            tradeType: TradeType.MARKET,
            triggerPrice: ethers.utils.parseUnits('1010.23', 30),
        };

        const orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createDecreaseOrder(request);

        await updateETHPrice(testEnv, '1000.231727');
        console.log('=====================');
        const tx = await executor.connect(keeper.signer).setPricesAndExecuteADL(
            [eth.address],
            [await indexPriceFeed.getPrice(eth.address)],
            [
                abiCoder.encode(
                    ['uint256'],
                    [(await oraclePriceFeed.getPrice(eth.address)).div('10000000000000000000000')],
                ),
            ],
            [
                {
                    positionKey: await positionManager.getPositionKey(trader.address, pairIndex, false),
                    sizeAmount: ethers.utils.parseUnits('2.4824', 18),
                    tier: 0,
                    referralsRatio: 0,
                    referralUserRatio: 0,
                    referralOwner: ZERO_ADDRESS,
                },
            ],
            orderId,
            TradeType.MARKET,
            0,
            0,
            0,
            ZERO_ADDRESS,
            { value: 1 },
        );
        await hre.run('decode-event', { hash: tx.hash, log: true });
    });
});
