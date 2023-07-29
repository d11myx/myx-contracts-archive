const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n testLpStableReserve")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-BTC"));
  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))

  // create increase
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await usdt.mint(user3.address, expandDecimals(30000, 18))
  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
  await fastPriceFeed.connect(user1).setPrices([await getConfig("Token-BTC")],
    [expandDecimals(30000, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  await usdt.connect(user3).approve(tradingRouter.address, expandDecimals(30000, 30));

  let orderId = await tradingRouter.increaseLimitOrdersIndex();
  let request = {
    account: user3.address,
    pairIndex: 0,
    tradeType: 1,
    collateral: expandDecimals(300000, 18),
    openPrice: expandDecimals(30000, 30),
    isLong: false,
    sizeAmount: expandDecimals(10, 18),
    tpPrice: expandDecimals(0, 30),
    tp: expandDecimals(0, 18),
    slPrice: expandDecimals(0, 30),
    sl: expandDecimals(0, 18)
  };
  await tradingRouter.connect(user3).createIncreaseOrder(request);

  console.log(`order: ${await tradingRouter.increaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

  // execute
  console.log("orderId:", orderId);
  // await executeRouter.executeIncreaseOrder(orderId, 1);
  await executeRouter.executeIncreaseLimitOrders([orderId]);
  console.log(`order after execute: ${await tradingRouter.increaseLimitOrders(orderId)}`);
  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, false)}`)
  console.log(`btc balance of trading vault: ${formatBalance(await btc.balanceOf(tradingVault.address))}`);
  console.log(`usdt balance of trading vault: ${formatBalance(await usdt.balanceOf(tradingVault.address))}`);

  let vault = await pairVault.getVault(0);
  console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} reserve of btc: ${formatBalance(vault.indexReservedAmount)}`);
  console.log(`total usdt: ${formatBalance(vault.stableTotalAmount)}  reserve of usdt: ${formatBalance(vault.stableReservedAmount)}`);

  // create decrease
  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(35000))
  await fastPriceFeed.connect(user1).setPrices([await getConfig("Token-BTC")],
    [expandDecimals(35000, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  console.log(`position: ${await tradingVault.getPosition(user3.address, 0, true)}`)

  orderId = await tradingRouter.decreaseLimitOrdersIndex();
  request = {
    account: user3.address,
    pairIndex: 0,
    tradeType: 1,
    collateral: expandDecimals(0, 18),
    triggerPrice: expandDecimals(35000, 30),
    sizeAmount: expandDecimals(9, 18),
    isLong: false
  };
  await tradingRouter.connect(user3).createDecreaseOrder(request)

  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

  // execute
  // await executeRouter.executeDecreaseOrder(orderId, 1);
  await executeRouter.executeDecreaseLimitOrders([orderId]);
  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`);
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);
  console.log(`btc balance of trading vault: ${formatBalance(await btc.balanceOf(tradingVault.address))}`);
  console.log(`usdt balance of trading vault: ${formatBalance(await usdt.balanceOf(tradingVault.address))}`);

  vault = await pairVault.getVault(0);
  console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} reserve of btc: ${formatBalance(vault.indexReservedAmount)}`);
  console.log(`total usdt: ${formatBalance(vault.stableTotalAmount)}  reserve of usdt: ${formatBalance(vault.stableReservedAmount)}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
