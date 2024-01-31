import { newTestEnv, TestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { MAX_UINT_AMOUNT, PaymentType, TradeType, waitForTx } from '../helpers';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import { TradingTypes } from '../types/contracts/core/Router';
import { expect } from './shared/expect';

describe('Router: NetworkFee cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            orderManager,
            btc,
            usdt,
            deployer,
            users: [depositor],
            router,
            pool,
            oraclePriceFeed,
        } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        await orderManager.updateNetworkFees(
            [PaymentType.ETH, PaymentType.COLLATERAL],
            [pairIndex, pairIndex],
            [
                {
                    basicNetworkFee: ethers.utils.parseUnits('0.01'),
                    discountThreshold: ethers.utils.parseUnits('1', await btc.decimals()),
                    discountedNetworkFee: ethers.utils.parseUnits('0.005'),
                },
                {
                    basicNetworkFee: ethers.utils.parseUnits('10', await usdt.decimals()),
                    discountThreshold: ethers.utils.parseUnits('1', await btc.decimals()),
                    discountedNetworkFee: ethers.utils.parseUnits('5', await usdt.decimals()),
                },
            ],
        );

        const btcAmount = ethers.utils.parseUnits('100', await btc.decimals());
        const usdtAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
        await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
        await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));
        const pair = await pool.getPair(pairIndex);

        await btc.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT);
        await usdt.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                btcAmount,
                usdtAmount,
                [btc.address],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                [0],
                { value: 1 },
            );
    });

    it('should ', async () => {
        const {
            pool,
            deployer,
            keeper,
            router,
            btc,
            usdt,
            orderManager,
            executor,
            users: [trader],
        } = testEnv;

        // const vault = await pool.getVault(pairIndex);
        // console.log(vault);

        const collateral = ethers.utils.parseUnits('3000', await usdt.decimals());
        const sizeAmount = ethers.utils.parseUnits('1', await btc.decimals());
        const openPrice = ethers.utils.parseUnits('30000', 30);
        const networkFeeAmount = ethers.utils.parseUnits('0.01', 18);

        const poolNetworkFeeAmount = await deployer.signer.provider?.getBalance(pool.address);
        expect(poolNetworkFeeAmount).to.be.eq(0);

        await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
        const req: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex,
            tradeType: TradeType.MARKET,
            collateral,
            openPrice,
            isLong: true,
            sizeAmount,
            maxSlippage: 0,
            paymentType: PaymentType.ETH,
            networkFeeAmount: networkFeeAmount,
        };
        const orderId = await orderManager.ordersIndex();
        await router.connect(trader.signer).createIncreaseOrder(req, { value: networkFeeAmount });
        const orderBefore = await orderManager.getIncreaseOrder(orderId, TradeType.MARKET);

        const poolNetworkFeeAmountBef = await deployer.signer.provider?.getBalance(pool.address);
        expect(poolNetworkFeeAmountBef).to.be.eq(networkFeeAmount);

        // await executor.connect(keeper.signer).setPricesAndExecuteOrders([], []);
        // console.log(orderBefore);
    });
});
