const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n decreaseMarketLong")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("MockPriceFeed-BTC"));
  let fastPriceFeed = await contractAt("IndexPriceFeed", await getConfig("IndexPriceFeed"))

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(31000))
  await fastPriceFeed.connect(user1).setPrices([await getConfig("Token-BTC")],
    [expandDecimals(30950, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)

  let orderId = await tradingRouter.ordersIndex();
  let request = {
    account: user3.address,
    pairIndex: 0,
    tradeType: 0,
    collateral: expandDecimals(-3000, 18),
    triggerPrice: expandDecimals(31000, 30),
    sizeAmount: expandDecimals(1, 18),
    isLong: true
  };
  await tradingRouter.connect(user3).createDecreaseOrder(request)

  console.log(`order: ${await tradingRouter.decreaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

  // execute
  let startIndex = await tradingRouter.ordersIndex();
  console.log("startIndex:", startIndex);
  await executeRouter.executeDecreaseOrder(orderId, 0);
  // await executeRouter.executeDecreaseMarketOrders(orderId.add(1));
  console.log(`order after execute: ${await tradingRouter.decreaseMarketOrders(orderId)}`);
  console.log(`position: ${await tradingVault.getPosition(user3.address, 0, true)}`)
  console.log(`btc balance of trading vault: ${formatBalance(await btc.balanceOf(tradingVault.address))}`);
  console.log(`usdt balance of trading vault: ${formatBalance(await usdt.balanceOf(tradingVault.address))}`);

  let vault = await pairVault.getVault(0);
  console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} reserve of btc: ${formatBalance(vault.indexReservedAmount)}`);
  console.log(`total usdt: ${formatBalance(vault.stableTotalAmount)}  reserve of usdt: ${formatBalance(vault.stableReservedAmount)}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
