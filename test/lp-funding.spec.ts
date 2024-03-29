// import { testEnv } from './helpers/make-suite';
// import { ethers } from 'hardhat';
// import { MockPriceFeed } from '../types';
// import { expect } from './shared/expect';
// import {
//     deployMockCallback,
//     getBlockTimestamp,
//     MAX_UINT_AMOUNT,
//     ORDER_MANAGER_ID,
//     TradeType,
//     waitForTx,
// } from '../helpers';
// import { mintAndApprove } from './helpers/misc';
// import { TradingTypes } from '../types/contracts/trading/Router';

// describe('Router: increase position ar', () => {
//     const pairIndex = 1;

//     before(async () => {
//         const {
//         users: [depositor],
//         btc,
//         usdt,
//         pool,
//         oraclePriceFeed,
//         } = testEnv;
//         // add liquidity
//         const indexAmount = ethers.utils.parseUnits('10000', 18);
//         const stableAmount = ethers.utils.parseUnits('300000000', 18);
//         let testCallBack = await deployMockCallback();
//         const pair = await pool.getPair(pairIndex);
//         await mintAndApprove(testEnv, btc, indexAmount, depositor, testCallBack.address);
//         await mintAndApprove(testEnv, usdt, stableAmount, depositor, testCallBack.address);
//         await testCallBack
//         .connect(depositor.signer)
//         .addLiquidity(pool.address, pair.indexToken, pair.stableToken, indexAmount, stableAmount);
//         const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
//         const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
//         const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
//         await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
//     });

//     describe('Router: collateral test cases', () => {
//         it('hava a postion and collateral, input collateral = 0', async () => {
//         const {
//         keeper,
//         users: [trader],
//         usdt,
//         router,
//         executor,
//         orderManager,
//         positionManager,
//         } = testEnv;

//         const traderPosition = await positionManager.getPosition(trader.address, pairIndex, true);
//         console.log(`before position: `, traderPosition);

//         const increasePositionRequest: TradingTypes.IncreasePositionRequestStruct = {
//         account: trader.address,
//         pairIndex: pairIndex,
//         tradeType: TradeType.MARKET,
//         collateral: 0,
//         openPrice: ethers.utils.parseUnits('30000', 30),
//         isLong: true,
//         sizeAmount: ethers.utils.parseUnits('5', 18),
//         };

//         const orderId = await orderManager.ordersIndex();
//         console.log(`order:`, await orderManager.increaseMarketOrders(orderId));

//         await router.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
//         await executor.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

//         const positionAfter = await positionManager.getPosition(trader.address, pairIndex, true);
//         console.log(`after position :`, positionAfter);

//         expect(positionAfter.positionAmount).to.be.eq(
//         traderPosition.positionAmount.add(ethers.utils.parseUnits('5', 18)),
//         );
//         });
//     });
// });
