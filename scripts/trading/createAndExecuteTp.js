const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\ncreateAndExecuteTp")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let btcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-BTC"));

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  let orderId = 0

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(31000))
  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

  // execute
  await executeRouter.executeDecreaseOrder(orderId, 2);

  // create
  orderId = await tradingRouter.decreaseLimitOrdersIndex();
  let request = {
    account: user3.address,
    pairIndex: 0,
    isLong: true,
    tpPrice: expandDecimals(31000, 30),
    tp: expandDecimals(1, 18),
    slPrice: expandDecimals(29000, 30),
    sl: expandDecimals(0, 18)
  };
  await tradingRouter.connect(user3).createTpSl(request)

  // execute
  await executeRouter.executeDecreaseOrder(orderId, 2);
  // await executeRouter.executeDecreaseLimitOrders([orderId]);
  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)
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
