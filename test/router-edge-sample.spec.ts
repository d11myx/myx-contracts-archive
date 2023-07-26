import { testEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { waitForTx } from '../helpers/utilities/tx';
import { MAX_UINT_AMOUNT, TradeType } from '../helpers/constants';
import { ITradingRouter } from '../types';
import { expect } from './shared/expect';

describe('Router: Edge cases', () => {
  before(async () => {
    // const { deployer } = testEnv;
    // console.log(`deployer address:`, deployer.address);
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

    const pairIndex = 0;

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

  it('open position', async () => {
    const {
      deployer,
      keeper,
      users: [trader],
      usdt,
      tradingRouter,
      executeRouter,
      tradingVault,
    } = testEnv;
    const pairIndex = 0;

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
});
