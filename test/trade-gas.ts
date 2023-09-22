import { TestEnv, newTestEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { expect } from './shared/expect';
import { deployMockCallback, MAX_UINT_AMOUNT, TradeType, waitForTx } from '../helpers';
import { mintAndApprove, updateBTCPrice } from './helpers/misc';
import snapshotGasCost from './shared/snapshotGasCost';
import { BigNumber } from 'ethers';
import { TradingTypes } from '../types/contracts/core/Router';

describe('Router: increase position ar', () => {
    const pairIndex = 0;
    let localTestEnv: TestEnv;
    let orderId: BigNumber;

    before(async () => {
        localTestEnv = (await newTestEnv()) as TestEnv;
        const {
            deployer,
            users: [depositor, poolAdmin, operator],
            btc,
            usdt,
            pool,
            roleManager,
            oraclePriceFeed,
        } = localTestEnv;

        const pair = await pool.getPair(pairIndex);

        await roleManager.connect(deployer.signer).addOperator(operator.address);
        await roleManager.connect(operator.signer).removeAccountBlackList(depositor.address);

        await updateBTCPrice(localTestEnv, '30000');
    });

    it('addLiquidity cast', async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator, trader],
            keeper,
            router,
            btc,
            usdt,
            pool,
            positionManager,
            executor,
            orderManager,
        } = localTestEnv;
        let testCallBack = await deployMockCallback();
        const pair = await pool.getPair(pairIndex);
        const indexAmount = ethers.utils.parseUnits('10000', 18);
        const stableAmount = ethers.utils.parseUnits('300000000', 18);
        await mintAndApprove(localTestEnv, btc, indexAmount, depositor, testCallBack.address);
        await mintAndApprove(localTestEnv, usdt, stableAmount, depositor, testCallBack.address);

        await testCallBack
            .connect(depositor.signer)
            .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    it('createIncreaseOrderWithoutTpSl cast', async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator, trader],
            keeper,
            router,
            btc,
            usdt,
            pool,
            positionManager,
            executor,
            orderManager,
        } = localTestEnv;
        const amount = ethers.utils.parseUnits('30000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

        // View user's position
        let traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log("user's position", traderPosition);

        const collateral = ethers.utils.parseUnits('10000', 18);
        await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral));
        await usdt.connect(trader.signer).approve(router.address, MAX_UINT_AMOUNT);

        const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: collateral,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('5', 18),
            maxSlippage: 0,
        };

        orderId = await orderManager.ordersIndex();

        // console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

        await snapshotGasCost(router.connect(trader.signer).createIncreaseOrderWithoutTpSl(increasePositionRequest));
    });
    it('executeIncreaseOrder cast', async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator, trader],
            keeper,
            router,
            btc,
            usdt,
            pool,
            positionManager,
            executionLogic,
            orderManager,
        } = localTestEnv;
        await snapshotGasCost(
            executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET, 0, 0),
        );
    });
    it('createDecreaseOrder cast', async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator, trader],
            keeper,
            router,
            btc,
            usdt,
            pool,
            positionManager,
            executionLogic,
            orderManager,
        } = localTestEnv;
        const position = await positionManager.getPosition(trader.address, pairIndex, true);
        // console.log(`position:`, position);

        expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));

        const decreasePositionRequest: TradingTypes.DecreasePositionRequestStruct = {
            account: trader.address,
            pairIndex: pairIndex,
            tradeType: TradeType.MARKET,
            collateral: 0,
            triggerPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: ethers.utils.parseUnits('5', 18),
            maxSlippage: 0,
        };
        orderId = await orderManager.ordersIndex();
        await snapshotGasCost(router.connect(trader.signer).createDecreaseOrder(decreasePositionRequest));
    });
    it('executeDecreaseOrder cast', async () => {
        const {
            deployer,
            users: [depositor, poolAdmin, operator, trader],
            keeper,
            router,
            btc,
            usdt,
            pool,
            positionManager,
            executionLogic,
            orderManager,
        } = localTestEnv;
        await snapshotGasCost(
            executionLogic.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET, 0, 0, false),
        );

        let traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        const lastTimePrice = traderPosition.averagePrice;
        // console.log(`before closing position: `, traderPosition);
        // console.log(`price before closing position: `, lastTimePrice);

        const closingPosition = await positionManager.getPosition(trader.address, pairIndex, true);
        const closingPositionPrice = closingPosition.averagePrice;
        // console.log(`afer closing position: `, closingPosition);
        // console.log(`price afer closing position: `, closingPositionPrice);
    });
});
