import { ethers } from 'hardhat';
import { TestEnv, newTestEnv } from './helpers/make-suite';
import { mintAndApprove } from './helpers/misc';
import { MAX_UINT_AMOUNT, TradeType, deployMockCallback, waitForTx } from '../helpers';
import { IPool } from '../types';
import { expect } from './shared/expect';
import { TradingTypes } from '../types/contracts/interfaces/IOrderManager';

describe('Router: check require condition, trigger errors', async () => {
    const pairIndex = 0;
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
        const indexAmount = ethers.utils.parseUnits('20000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);
        let testCallBack = await deployMockCallback(btc.address, usdt.address);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
        await testCallBack.connect(depositor.signer).addLiquidity(pool.address, pairIndex, indexAmount, stableAmount);
    });
    after(async () => {});

    describe('createIncreaseOrder permission check', async () => {
        it('check msg.sender whith request.account', async () => {
            const {
                keeper,
                deployer,
                users: [user1, user2],
                usdt,
                router,
                executor,
                tradingVault,
                orderManager,
            } = testEnv;

            const amount = ethers.utils.parseUnits('10000', 18);
            const collateral = ethers.utils.parseUnits('10000', 18);
            const size = ethers.utils.parseUnits('10', 18);

            await waitForTx(await usdt.connect(deployer.signer).mint(user1.address, collateral));
            await usdt.connect(user1.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

            await waitForTx(await usdt.connect(deployer.signer).mint(user2.address, collateral));
            await usdt.connect(user2.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

            // setting: request.account = user1
            const increasePositionRequest: TradingTypes.CreateOrderRequestStruct = {
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
            };

            // setting createIncreateOrder: msg.sender = user
            const orderId = await orderManager.increaseMarketOrdersIndex();
            await router.connect(user2.signer).createIncreaseOrder(increasePositionRequest);
            await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            // await expect(router.connect(user2.signer).createIncreaseOrder(increasePositionRequest)).to.be.revertedWith('not order sender or handler');
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

        //     const orderId = await tradingRouter.increaseMarketOrdersIndex();
        //     await expect(router.connect(user1.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
        // });

        describe('disable pair', async () => {
            after('afer enable pair', async () => {
                const { pool } = testEnv;

                const pair = await pool.getPair(pairIndex);
                console.log(`pair: `, pair);
                const newPair: IPool.PairStruct = {
                    indexToken: pair.indexToken,
                    stableToken: pair.stableToken,
                    pairToken: pair.pairToken,
                    enable: true,
                    kOfSwap: pair.kOfSwap,
                    expectIndexTokenP: pair.expectIndexTokenP,
                    addLpFeeP: pair.addLpFeeP,
                };
                await pool.updatePair(pairIndex, newPair);
            });

            it('pair is enable', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    router,
                    pool,
                    orderManager,
                } = testEnv;

                // disable pair
                const pairBef = await pool.getPair(pairIndex);
                console.log(`pair: `, pairBef);
                const newPair: IPool.PairStruct = {
                    indexToken: pairBef.indexToken,
                    stableToken: pairBef.stableToken,
                    pairToken: pairBef.pairToken,
                    enable: false,
                    kOfSwap: pairBef.kOfSwap,
                    expectIndexTokenP: pairBef.expectIndexTokenP,
                    addLpFeeP: pairBef.addLpFeeP,
                };
                await pool.updatePair(pairIndex, newPair);

                const pairAft = await pool.getPair(pairIndex);
                console.log(`pairAft: `, pairAft);

                const collateral = ethers.utils.parseUnits('10000', 18);
                const size = ethers.utils.parseUnits('10', 18);

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
                await usdt.connect(trader.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.CreateOrderRequestStruct = {
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
                };

                const orderId = await orderManager.increaseMarketOrdersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrder(increasePositionRequest),
                ).to.be.revertedWith('trade pair not supported');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });
        });

        describe('check increase sizeAmount', async () => {
            it('sizeAmount = 0, trigger error: size eq 0', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    router,
                    orderManager,
                } = testEnv;

                const collateral = ethers.utils.parseUnits('10000', 18);

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
                await usdt.connect(trader.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.CreateOrderRequestStruct = {
                    account: trader.address,
                    pairIndex: pairIndex,
                    tradeType: TradeType.MARKET,
                    collateral: collateral,
                    openPrice: ethers.utils.parseUnits('30000', 30),
                    isLong: true,
                    sizeAmount: 0,
                    tp: 0,
                    tpPrice: 0,
                    sl: 0,
                    slPrice: 0,
                };

                const orderId = await orderManager.increaseMarketOrdersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrder(increasePositionRequest),
                ).to.be.revertedWith('size eq 0');
                // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET)
            });

            it('sizeAmount < tradingConfig.minTradeAmount, trigger error: invalid trade size', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    router,
                    pool,
                    orderManager,
                } = testEnv;

                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const minTradeAmount = tradingConfig.minTradeAmount;
                const maxTradeAmount = tradingConfig.maxTradeAmount;

                console.log(`--minTradeAmount: `, minTradeAmount);
                console.log(`--maxTradeAmount: `, maxTradeAmount);

                const collateral = ethers.utils.parseUnits('10000', 18);
                const sizeAmount = ethers.utils.parseUnits('5', 15);

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
                await usdt.connect(trader.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.CreateOrderRequestStruct = {
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
                };

                const orderId = await orderManager.increaseMarketOrdersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrder(increasePositionRequest),
                ).to.be.revertedWith('invalid trade size');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });

            it('sizeAmount > tradingConfig.maxTradeAmount, trigger error: invalid trade size', async () => {
                const {
                    keeper,
                    deployer,
                    users: [trader],
                    usdt,
                    pool,
                    router,
                    orderManager,
                } = testEnv;

                const tradingConfig = await pool.getTradingConfig(pairIndex);
                const minTradeAmount = tradingConfig.minTradeAmount;
                const maxTradeAmount = tradingConfig.maxTradeAmount;

                console.log(`minTradeAmount: `, minTradeAmount);
                console.log(`maxTradeAmount: `, maxTradeAmount);

                const amount = ethers.utils.parseUnits('30000', 18);
                const collateral = ethers.utils.parseUnits('1000', 18);
                const sizeAmount = ethers.utils.parseUnits('100001', 18);

                await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));
                await usdt.connect(trader.signer).approve(orderManager.address, MAX_UINT_AMOUNT);

                const increasePositionRequest: TradingTypes.CreateOrderRequestStruct = {
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
                };

                const orderId = await orderManager.increaseMarketOrdersIndex();
                await expect(
                    router.connect(trader.signer).createIncreaseOrder(increasePositionRequest),
                ).to.be.revertedWith('invalid trade size');
                // await executer.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
            });
        });
    });
});
