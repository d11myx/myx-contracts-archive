const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\nincreaseMarketLong")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  // await usdt.mint(user0.address, expandDecimals(100, 18))
  await vaultPriceFeed.setPrice(btc.address, expandDecimals(100, 30));

  await usdt.approve(tradingRouter.address, expandDecimals(100, 30));

  let orderId = await tradingRouter.increaseMarketOrdersIndex();
  let request = {
    account: user0.address,
    pairIndex: 0,
    tradeType: 0,
    collateral: expandDecimals(100, 18),
    openPrice: expandDecimals(100, 30),
    isLong: true,
    sizeAmount: expandDecimals(10, 18),
    tpPrice: expandDecimals(110, 30),
    tp: expandDecimals(1, 18),
    slPrice: expandDecimals(90, 30),
    sl: expandDecimals(1, 18)
  };
  await tradingRouter.createIncreaseOrder(request)

  console.log(`order: ${await tradingRouter.increaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  // execute
  let startIndex = await tradingRouter.increaseMarketOrderStartIndex();
  console.log("startIndex:", startIndex, "orderId:", orderId);
  await executeRouter.executeIncreaseOrder(orderId, 0);

  // await tradingRouter.connect(user1).executeIncreaseMarketOrders(orderId.add(1));
  console.log(`order after execute: ${await tradingRouter.increaseMarketOrders(orderId)}`);
  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingVault.address)}`);

  let vault = await pairVault.getVault(0);
  console.log(`reserve of btc: ${vault.indexReservedAmount}`);
  console.log(`reserve of usdt: ${vault.stableReservedAmount}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
