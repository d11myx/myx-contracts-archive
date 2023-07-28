import { SignerWithAddress, testEnv } from './helpers/make-suite';
import { ethers } from 'hardhat';
import { waitForTx } from './helpers/tx';
import { MAX_UINT_AMOUNT, TradeType } from './shared/constants';
import { ITradingRouter, PriceFeed } from '../types';
import { expect } from './shared/expect';
import { BigNumber } from 'ethers';

describe('IncreasePosition: Edge cases', () => {
  const pairIndex = 0;

  before(async () => {
    const { btc, vaultPriceFeed } = testEnv;

    const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
    const btcPriceFeedAddress = await vaultPriceFeed.priceFeeds(btc.address);
    const btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
    await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits('30000', 8)));
  });
  after(async () => {});

  it('increaseposition: print liquidity', async () => {
    const {
      deployer,
      btc,
      usdt,
      users: [depositor],
      pairLiquidity,
      pairVault,
    } = testEnv;
    const pairVaultInfo = await pairVault.getVault(pairIndex);
    console.log(`indexTotalAmount:`, ethers.utils.formatUnits(pairVaultInfo.indexTotalAmount, await btc.decimals()));
    console.log(`stableTotalAmount:`, ethers.utils.formatUnits(pairVaultInfo.stableTotalAmount, await usdt.decimals()));
  });

  it('collateral: collateral is 0 or negative number', async () => {
    const {
      deployer,
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;

    const traderPosition = await tradingVault.getPosition(trader.address, pairIndex, true);
    console.log('------------traderPosition ------------')
    console.log(traderPosition)

    // const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
    //   account: trader.address,
    //   pairIndex: pairIndex,
    //   tradeType: TradeType.MARKET,
    //   collateral: 0,
    //   openPrice: ethers.utils.parseUnits('30000', 30),
    //   isLong: true,
    //   sizeAmount: ethers.utils.parseUnits('8', 18),
    //   tpPrice: 0,
    //   tp: 0,
    //   slPrice: 0,
    //   sl: 0,
    // };
    // const orderId = await tradingRouter.increaseMarketOrdersIndex();
    // await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

    // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);
    // const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
    // console.log('------------positionAfter ------------')
    // console.log(positionAfter)

    // const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
    //   account: trader.address,
    //   pairIndex: pairIndex,
    //   tradeType: TradeType.MARKET,
    //   collateral: amount,
    //   openPrice: ethers.utils.parseUnits('30000', 30),
    //   isLong: true,
    //   sizeAmount: ethers.utils.parseUnits('10', 18),
    //   tpPrice: ethers.utils.parseUnits('31000', 30),
    //   tp: ethers.utils.parseUnits('1', 18),
    //   slPrice: ethers.utils.parseUnits('27000', 30),
    //   sl: ethers.utils.parseUnits('1', 18),
    // };

    // await tradingRouter.setHandler(trader.address, true);
    // await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

    // const orderId = 0;
    // console.log(`order:`, await tradingRouter.increaseMarketOrders(orderId));

    // await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

    // const position = await tradingVault.getPosition(trader.address, pairIndex, true);
    // console.log(`position:`, position);
    // expect(position.positionAmount).to.be.eq(ethers.utils.parseUnits('10', 18));
  });

  // it('increase position without adding collateral', async () => {
  //   const {
  //     keeper,
  //     users: [trader],
  //     tradingRouter,
  //     executeRouter,
  //     tradingVault,
  //   } = testEnv;

  //   const positionBefore = await tradingVault.getPosition(trader.address, pairIndex, true);
  //   const positionAmountBefore = positionBefore.positionAmount;
  //   expect(positionAmountBefore).to.be.eq(ethers.utils.parseUnits('10', 18));

  //   const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
  //     account: trader.address,
  //     pairIndex: pairIndex,
  //     tradeType: TradeType.MARKET,
  //     collateral: 0,
  //     openPrice: ethers.utils.parseUnits('30000', 30),
  //     isLong: true,
  //     sizeAmount: ethers.utils.parseUnits('8', 18),
  //     tpPrice: 0,
  //     tp: 0,
  //     slPrice: 0,
  //     sl: 0,
  //   };
  //   const orderId = await tradingRouter.increaseMarketOrdersIndex();
  //   await tradingRouter.connect(trader.signer).createIncreaseOrder(increasePositionRequest);

  //   await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, TradeType.MARKET);

  //   const positionAfter = await tradingVault.getPosition(trader.address, pairIndex, true);
  //   const positionAmountAfter = positionAfter.positionAmount;
  //   expect(positionAmountAfter).to.be.eq(positionAmountBefore.add(ethers.utils.parseUnits('8', 18)));
  // });
});

export async function increaseUserPosition(
  user: SignerWithAddress,
  pairIndex: number,
  collateral: BigNumber,
  price: BigNumber,
  size: BigNumber,
  isLong: boolean,
) {
  const { keeper, tradingRouter, executeRouter } = testEnv;

  const increasePositionRequest: ITradingRouter.IncreasePositionRequestStruct = {
    account: user.address,
    pairIndex: pairIndex,
    tradeType: TradeType.MARKET,
    collateral: collateral,
    openPrice: price,
    isLong: isLong,
    sizeAmount: size,
    tpPrice: 0,
    tp: 0,
    slPrice: 0,
    sl: 0,
  };

  await tradingRouter.setHandler(user.address, true);

  const increaseOrderId = await tradingRouter.increaseMarketOrdersIndex();
  await tradingRouter.connect(user.signer).createIncreaseOrder(increasePositionRequest);
  await executeRouter.connect(keeper.signer).executeIncreaseOrder(increaseOrderId, TradeType.MARKET);
}
