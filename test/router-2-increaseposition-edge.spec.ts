import { SignerWithAddress, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { waitForTx } from './helpers/tx';
import { MAX_UINT_AMOUNT, TradeType } from './shared/constants';
import { ITradingRouter } from '../types';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';

describe('Router: collateral amount cases', () => {
  const pairIndex = 0;

  before(async () => {
    const { btc, vaultPriceFeed } = testEnv;

    const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
    const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
    const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
    await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
  });
  after(async () => {});

  it('no position, where collateral <= 0', async () => {
    const {
      deployer,
      users: [trader],
      usdt,
      tradingRouter,
      tradingVault,
    } = testEnv;

    const amount = ethers.utils.parseUnits('30000', 18)
    await waitForTx(await usdt.connect(deployer.signer).mint(trader.address,amount))

    // View user's position
    const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log("user's position", traderPosition)

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
      account: trader.address,
      pairIndex: pairIndex,
      tradeType: TradeType.MARKET,
      collateral: 0,
      openPrice: ethers.utils.parseUnits('30000', 30),
      isLong: true,
      sizeAmount: ethers.utils.parseUnits('8', 18),
      tpPrice: ethers.utils.parseUnits('31000', 30),
      tp: ethers.utils.parseUnits('1', 18),
      slPrice: ethers.utils.parseUnits('29000', 30),
      sl: ethers.utils.parseUnits('1', 18),
    };

    await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
  });

  it('no position, open position', async() =>{
    const {
      deployer,
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const collateral = ethers.utils.parseUnits('10000', 18);
    await waitForTx(await usdt.connect(deployer.signer).mint(trader.address, collateral))
    await usdt.connect(trader.signer).approve(tradingRouter.address, MAX_UINT_AMOUNT);

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        account: trader.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: collateral,
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: true,
        sizeAmount: ethers.utils.parseUnits('5', 18),
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const position = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log(`position:`, position);

    expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('5', 18));
  });

  it('hava a position and collateral, input collateral > 0', async() =>{
    const {
      deployer,
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true)
    console.log(`user's current postion: `, traderPosition)

    const amount = ethers.utils.parseUnits('300', 18)

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        account: trader.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: amount,
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: true,
        sizeAmount: ethers.utils.parseUnits('5', 18),
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const position = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log(`update position:`, position);

    expect(position.positionAmount).to.be.eq(traderPosition.positionAmount.add(ethers.utils.parseUnits('5', 18)));
  });

  it('hava a postion and collateral, input collateral = 0', async () => {
    const {
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true)
    console.log(`before position: `, traderPosition)
  
    // const traderBalance = await usdt.balanceOf(trader.address)
    // console.log(`user balance: `, traderBalance)

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        account: trader.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: 0,
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: true,
        sizeAmount: ethers.utils.parseUnits('5', 18),
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log(`after position :`, positionAfter);

    expect(positionAfter.positionAmount).to.be.eq(traderPosition.positionAmount.add(ethers.utils.parseUnits('5', 18)));
  });

  it('hava a postion and collateral, input collateral < 0', async() => {
    const {
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const balanceBefore = await usdt.balanceOf(trader.address)
    const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true)
    const traderCollateral = traderPosition.collateral
    
    console.log(`user balanceBefore: `, balanceBefore)
    console.log(`user traderCollateral: `, traderCollateral)


    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        account: trader.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: ethers.utils.parseUnits('-500', 18),
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: true,
        sizeAmount: ethers.utils.parseUnits('5', 18),
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    const position = await tradingVault.getPosition(trader.address, pairIndex, true);
    const collateralAfter = position.collateral
    
    // user address add collateral
    const balanceAfter = await usdt.balanceOf(trader.address)

    console.log(`After collateral: `, collateralAfter)
    console.log(`After balance: `, balanceAfter)

    expect(traderCollateral).to.be.eq(collateralAfter.add(ethers.utils.parseUnits('500', 18)))
  });

  it('hava a postion and collateral, input: collateral < 0 and abs > collateral', async() => {
    const {
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const balance = await usdt.balanceOf(trader.address)
    const traderPosition = tradingVault.getPosition(trader.address, pairIndex, true)
    const traderCollateral = (await traderPosition).collateral

    console.log(`user balance: `, balance)
    console.log('user collateral: ', traderCollateral)

    const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
        account: trader.address,
        pairIndex: pairIndex,
        tradeType: TradeType.MARKET,
        collateral: ethers.utils.parseUnits('-9300', 18),
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: true,
        sizeAmount: ethers.utils.parseUnits('5', 18),
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    await expect(tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest)).to.be.reverted;
  });

});
