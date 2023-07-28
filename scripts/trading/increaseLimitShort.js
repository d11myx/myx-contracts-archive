const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n increaseLimitShort")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-BTC"));

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await usdt.mint(user3.address, expandDecimals(30000, 18))
  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))

  await usdt.connect(user3).approve(tradingRouter.address, expandDecimals(30000, 30));

  let orderId = await tradingRouter.increaseLimitOrdersIndex();
  let request = {
    account: user3.address,
    pairIndex: 0,
    tradeType: 1,
    collateral: expandDecimals(30000, 18),
    openPrice: expandDecimals(30000, 30),
    isLong: false,
    sizeAmount: expandDecimals(5, 18),
    tpPrice: expandDecimals(29000, 30),
    tp: expandDecimals(1, 18),
    slPrice: expandDecimals(31000, 30),
    sl: expandDecimals(1, 18)
  };
  await tradingRouter.connect(user3).createIncreaseOrder(request);

  console.log(`order: ${await tradingRouter.increaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

  // execute
  console.log("orderId:", orderId);
  await executeRouter.executeIncreaseOrder(orderId, 1);
  // await executeRouter.executeIncreaseLimitOrders([orderId]);
  console.log(`order after execute: ${await tradingRouter.increaseLimitOrders(orderId)}`);
  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, false)}`)
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
