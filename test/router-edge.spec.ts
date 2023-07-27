import { testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { waitForTx } from './helpers/tx';
import { MAX_UINT_AMOUNT, TradeType } from './shared/constants';
import { ITradingRouter, PriceFeed } from '../types';
import { expect } from './shared/expect';

describe('Router: Edge cases', () => {
  const pairIndex = 0;

  before(async () => {
    const { btc, vaultPriceFeed } = testEnv;

    const priceFeedFactory = await ethers.getContractFactory('PriceFeed');
    const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
    const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
    await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
  });
  after(async () => {});

  it('add liquidity', async () => {
    const {
      deployer,
      btc,
      usdt,
      users: [depositor],
      pairLiquidity,
      pairVault,
    } = testEnv;

    const btcAmount = ethers.utils.parseUnits('100', await btc.decimals());
    const usdtAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
    await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
    await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));

    await btc.connect(depositor.signer).approve(pairLiquidity.address, MAX_UINT_AMOUNT);
    await usdt.connect(depositor.signer).approve(pairLiquidity.address, MAX_UINT_AMOUNT);
    await pairLiquidity.connect(depositor.signer).addLiquidity(pairIndex, btcAmount, usdtAmount);

    const pairVaultInfo = await pairVault.getVault(pairIndex);
    console.log(`indexTotalAmount:`, ethers.utils.formatUnits(pairVaultInfo.indexTotalAmount, await btc.decimals()));
    console.log(`stableTotalAmount:`, ethers.utils.formatUnits(pairVaultInfo.stableTotalAmount, await usdt.decimals()));
  });

  it('open position with adding collateral', async () => {
    const {
      deployer,
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const amount = ethers.utils.parseUnits('30000', 18);
    await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, amount));

    await usdt.connect(trader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
      account: trader.address,
      pairIndex: pairIndex,
      tradeType: TradeType.MARKET,
      collateral: amount,
      openPrice: ethers.utils.parseUnits('30000', 30),
      isLong: true,
      sizeAmount: ethers.utils.parseUnits('10', 18),
      tpPrice: ethers.utils.parseUnits('31000', 30),
      tp: ethers.utils.parseUnits('1', 18),
      slPrice: ethers.utils.parseUnits('29000', 30),
      sl: ethers.utils.parseUnits('1', 18),
    };

    await tradingRouter.setHandler(trader.address, true);

    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

    const orderId = 0;
    console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const position = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log(`position:`, position);
    expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));
  });

  it('increase position without adding collateral', async () => {
    const {
      keeper,
      users: [trader],
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountBefore = positionBefore.positionAmount;
    expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('10', 18));

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
      account: trader.address,
      pairIndex: pairIndex,
      tradeType: TradeType.MARKET,
      collateral: 0,
      openPrice: ethers.utils.parseUnits('30000', 30),
      isLong: true,
      sizeAmount: ethers.utils.parseUnits('8', 18),
      tpPrice: 0,
      tp: 0,
      slPrice: 0,
      sl: 0,
    };
    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountAfter = positionAfter.positionAmount;
    expect(positionAmountAfter).to.be.eq(positionAmountBefore.add(ethers.utils.parseUnits('8', 18)));
  });

  it('decrease position', async () => {
    const {
      keeper,
      users: [trader],
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;
    const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountBefore = positionBefore.positionAmount;
    expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('18', 18));

    // Decrease position
    const increasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
      account: trader.address,
      pairIndex: pairIndex,
      tradeType: TradeType.MARKET,
      collateral: 0,
      triggerPrice: ethers.utils.parseUnits('30000', 30),
      isLong: true,
      sizeAmount: ethers.utils.parseUnits('3', 18),
    };
    const orderId = await tradingRouter.decreaseMarketOrdersIndex();
    await tradingRouter.connect(trader.signer).createDecreaseOrder(increasePositionRequest);

    await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

    const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountAfter = positionAfter.positionAmount;

    expect(positionAmountAfter).to.be.eq(positionAmountBefore.sub(ethers.utils.parseUnits('3', 18)));
  });

  it('Closing position', async ()=> {
    const {
      keeper,
      users: [trader],
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;
    const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountBefore = positionBefore.positionAmount;
    expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('15', 18));
    
    // Closing position
    const increasePositionRequest: ITradingRouter.DecreasePositionRequestStruct = {
      account: trader.address,
      pairIndex: pairIndex,
      tradeType: TradeType.MARKET,
      collateral: 0,
      triggerPrice: ethers.utils.parseUnits('30000',30),
      isLong: true,
      sizeAmount: positionAmountBefore,
    };
    const orderId = await tradingRouter.decreaseMarketOrdersIndex();
    await tradingRouter.connect(trader.signer).createDecreaseOrder(increasePositionRequest);

    await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, TradeType.MARKET);

    const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
    const positionAmountAfter = positionAfter.positionAmount;

    expect(positionAmountAfter).to.be.eq(0);

  });

  // describe('Router: ADL cases', () => {
  //   const pairIndex = 0;
  //   let btcPriceFeed: PriceFeed;

  //   before(async () => {
  //     const { keeper, btc, vaultPriceFeed } = testEnv;

  //     const priceFeedFactory = await ethers.getContractFactory('PriceFeed');
  //     const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
  //     btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
  //     await waitForTx(await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
  //   });
  //   after(async () => {
  //     const { keeper } = testEnv;

  //     await waitForTx(await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
  //   });

  //   it('price goes up, the first trader will make a profit', async () => {
  //     const {
  //       deployer,
  //       keeper,
  //       users: [trader, adlTrader],
  //       usdt,
  //       pairVault,
  //       tradingRouter,
  //       executeRouter,
  //       tradingVault,
  //     } = testEnv;

  //     const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
  //     expect(traderPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('15', 18));

  //     // adlTrader open position
  //     const amount = ethers.utils.parseUnits('300000', 18);
  //     await waitForTx(await usdt.connect(deployer.signer).mint(adlTrader.address, amount));
  //     await usdt.connect(adlTrader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

  //     const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
  //       account: adlTrader.address,
  //       pairIndex: pairIndex,
  //       tradeType: TradeType.MARKET,
  //       collateral: amount,
  //       openPrice: ethers.utils.parseUnits('50000', 30),
  //       isLong: true,
  //       sizeAmount: ethers.utils.parseUnits('30', 18),
  //       tpPrice: 0,
  //       tp: 0,
  //       slPrice: 0,
  //       sl: 0,
  //     };

  //     await tradingRouter.setHandler(adlTrader.address, true);

  //     const orderId = await tradingRouter.increaseMarketOrdersIndex();
  //     await tradingRouter.connect(adlTrader.signer).createIncreaseOrder(increasePositionRequest);
  //     await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

  //     const adlTraderPosition = await tradingVault.getPosition(adlTrader.address, pairIndex, true);
  //     expect(adlTraderPosition.positionAmount).to.be.eq(ethers.utils.parseUnits('30', 18));

  //     // price goes up to 50000
  //     await waitForTx(await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits('50000', 8)));

  //     // available index amount < 5
  //     const pairVaultInfo = await pairVault.getVault(pairIndex);
  //     const indexTotalAmount = pairVaultInfo.indexTotalAmount;
  //     const indexReservedAmount = pairVaultInfo.indexReservedAmount;
  //     expect(indexTotalAmount.sub(indexReservedAmount)).to.be.lt(ethers.utils.parseUnits('5', 18));

  //     // adlTrade decrease position more than 5, will trigger adl
  //   });
  // });
});
