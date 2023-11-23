import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { increasePosition, mintAndApprove, updateETHPrice } from './helpers/misc';
import { TradeType, ZERO_ADDRESS, abiCoder } from '../helpers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Replay: adl', () => {
    const pairIndex = 2;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();

        const {
            users: [depositor],
            weth,
            usdt,
            pool,
            router,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('4.5', await weth.decimals());
        const stableAmount = ethers.utils.parseUnits('2000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);

        await weth.connect(depositor.signer).approve(router.address, indexAmount);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

        await router
            .connect(depositor.signer)
            .addLiquidityETH(
                pair.indexToken,
                pair.stableToken,
                indexAmount,
                stableAmount,
                [weth.address],
                [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                1,
                { value: indexAmount.add(1) },
            );
    });

    it('adl', async () => {
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
        // await hre.run('decode-event', { hash: tx.hash, log: true });
    });
});
