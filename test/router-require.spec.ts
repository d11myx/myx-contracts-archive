import { ethers } from 'hardhat';
import { TestEnv, newTestEnv } from './helpers/make-suite';
import { mintAndApprove } from './helpers/misc';
import { MAX_UINT_AMOUNT, TradeType, deployMockCallback, waitForTx } from '../helpers';
import { IPool, IRouter, Router } from '../types';
import { expect } from './shared/expect';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: check require condition, trigger errors', async () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            users: [depositor],
            usdt,
            btc,
            pool,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('20000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
        let testCallBack = await deployMockCallback();
        var pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });
    after(async () => {});

    describe('createIncreaseOrderWithTpSl permission check', async () => {
        it('check msg.sender whith request.account', async () => {
            const {
                keeper,
                deployer,
                users: [user1, user2],
                usdt,
                btc,
                router,
                executionLogic,
                orderManager,
            } = testEnv;

            const amount = ethers.utils.parseUnits('10000', await btc.decimals());
            const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
            const size = ethers.utils.parseUnits('10', 18);

            await waitForTx(await usdt.connect(deployer.signer).mint(user1.address, collateral));
            await usdt.connect(user1.signer).approve(router.address, MAX_UINT_AMOUNT);

            await waitForTx(await usdt.connect(deployer.signer).mint(user2.address, collateral));
            await usdt.connect(user2.signer).approve(router.address, MAX_UINT_AMOUNT);

            // setting: request.account = user1
            const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                account: user1.address,
                pairIndex: pairIndex,
                tradeType: TradeType.MARKET,
                collateral: collateral,
                openPrice: ethers.utils.parseUnits('30000', 30),
                isLong: true,
                sizeAmount: size,
                tp: 0,
                tpPrice: 0,
                sl: 0,
                slPrice: 0,
                maxSlippage: 0,
            };

            // setting createIncreateOrder: msg.sender = user
            const orderId = await orderManager.ordersIndex();
            await router.connect(user2.signer).createIncreaseOrderWithTpSl(increasePositionRequest);
            await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0);
            // await expect(router.connect(user2.signer).createIncreaseOrderWithTpSl(increasePositionRequest)).to.be.revertedWith('not order sender or handler');
        });

        // TODO: Function to be implemented
        // it('Check if the user <isFrozen>', async () => {
        //     const {
        //         keeper,
        //         deployer,
        //         users: [ user1, user2],
        //         usdt,
        //         tradingRouter,
        //         tradingVault,
        //         executeRouter
        //     } = testEnv;

        //     const collateral = ethers.utils.parseUnits('10000', 18);
        //     const size = ethers.utils.parseUnits('10', 18);

        //     await waitForTx(await usdt.connect(deployer.signer).mint(user1.address, collateral));
        //     await usdt.connect(user1.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

        //     await waitForTx(await usdt.connect(deployer.signer).mint(user2.address, collateral));
        //     await usdt.connect(user2.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

        //     const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
        //         account: user1.address,
        //         pairIndex: pairIndex,
        //         tradeType: TradeType.MARKET,
        //         collateral: collateral,
        //         openPrice: ethers.utils.parseUnits('30000', 30),
        //         isLong: true,
        //         sizeAmount: size,
        //         tp: 0,
        //         tpPrice: 0,
        //         sl: 0,
        //         slPrice: 0
        //     };

        //     const isFrozen = tradingVault.isFrozen(user1.address);

        //     const orderId = await tradingRouter.ordersIndex();
        //     await expect(router.connect(user1.signer).createIncreaseOrderWithTpSl(increasePositionRequest)).to.be.reverted;
        // });

        describe('disable pair', async () => {
            after('afer enable pair', async () => {
                const { pool } = testEnv;

                const pair = await pool.getPair(pairIndex);
                // console.log(`pair: `, pair);
                const newPair: IPool.PairStruct = {
                    pairIndex: pairIndex,
                    indexToken: pair.indexToken,
                    stableToken: pair.stableToken,
                    pairToken: pair.pairToken,
                    enable: true,
                    kOfSwap: pair.kOfSwap,
                    expectIndexTokenP: pair.expectIndexTokenP,
                    maxUnbalancedP: pair.maxUnbalancedP,
                    unbalancedDiscountRate: pair.unbalancedDiscountRate,
                    addLpFeeP: pair.addLpFeeP,
                    removeLpFeeP: pair.addLpFeeP,
                    lpFeeDistributeP: pair.lpFeeDistributeP,
                };
                await pool.updatePair(pairIndex, newPair);
            });

            it('pair is enable', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    pool,
                    orderManager,
                } = testEnv;

                // disable pair
                const pairBef = await pool.getPair(pairIndex);
                // console.log(`pair: `, pairBef);
                const newPair: IPool.PairStruct = {
                    pairIndex: pairIndex,
                    indexToken: pairBef.indexToken,
                    stableToken: pairBef.stableToken,
                    pairToken: pairBef.pairToken,
                    enable: false,
                    kOfSwap: pairBef.kOfSwap,
                    expectIndexTokenP: pairBef.expectIndexTokenP,
                    maxUnbalancedP: pairBef.maxUnbalancedP,
                    unbalancedDiscountRate: pairBef.unbalancedDiscountRate,
                    addLpFeeP: pairBef.addLpFeeP,
                    removeLpFeeP: pairBef.addLpFeeP,
                    lpFeeDistributeP: pairBef.lpFeeDistributeP,
                };
                await pool.updatePair(pairIndex, newPair);

                const pairAft = await pool.getPair(pairIndex);
                // console.log(`pairAft: `, pairAft);

                const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
                const size = ethers.utils.parseUnits('10', await btc.decimals());

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
                await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                    account: trader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice: ethers.utils.parseUnits('30000', 30),
                    isLong: true,
                    sizeAmount: size,
                    tp: 0,
                    tpPrice: 0,
                    sl: 0,
                    slPrice: 0,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest),
                ).to.be.revertedWith('trade pair not supported');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });
        });

        describe('check increase sizeAmount', async () => {
            it('sizeAmount < tradingConfig.minTradeAmount, trigger error: invalid trade size', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    btc,
                    router,
                    pool,
                    orderManager,
                } = testEnv;

                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const minTradeAmount = tradingConfig.minTradeAmount;
                const maxTradeAmount = tradingConfig.maxTradeAmount;

                // console.log(`--minTradeAmount: `, minTradeAmount);
                // console.log(`--maxTradeAmount: `, maxTradeAmount);

                const collateral = ethers.utils.parseUnits('10000', await usdt.decimals());
                const sizeAmount = ethers.utils.parseUnits('0.0005', await btc.decimals());

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
                await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                    account: trader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice: ethers.utils.parseUnits('30000', 30),
                    isLong: true,
                    sizeAmount: sizeAmount,
                    tp: 0,
                    tpPrice: 0,
                    sl: 0,
                    slPrice: 0,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest),
                ).to.be.revertedWith('invalid trade size');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });

            it('sizeAmount > tradingConfig.maxTradeAmount, trigger error: invalid trade size', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    btc,
                    pool,
                    router,
                    orderManager,
                } = testEnv;

                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const minTradeAmount = tradingConfig.minTradeAmount;
                const maxTradeAmount = tradingConfig.maxTradeAmount;

                // console.log(`minTradeAmount: `, minTradeAmount);
                // console.log(`maxTradeAmount: `, maxTradeAmount);

                const amount = ethers.utils.parseUnits('30000', await btc.decimals());
                const collateral = ethers.utils.parseUnits('1000', await usdt.decimals());
                const sizeAmount = ethers.utils.parseUnits('100001', 18);

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));
                await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
                    account: trader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice: ethers.utils.parseUnits('30000', 30),
                    isLong: true,
                    sizeAmount: sizeAmount,
                    tp: 0,
                    tpPrice: 0,
                    sl: 0,
                    slPrice: 0,
                    maxSlippage: 0,
                };

                const orderId = await orderManager.ordersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrderWithTpSl(increasePositionRequest),
                ).to.be.revertedWith('invalid trade size');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });
        });
    });
});
