const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\ncreateAndExecuteSl")

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
  await vaultPriceFeed.setPrice(btc.address, expandDecimals(100, 30));

  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)

  let orderId = 1;

  await vaultPriceFeed.setPrice(btc.address, expandDecimals(110, 30));
  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`)
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  // execute
  await executeRouter.executeDecreaseOrder(orderId, 3);

  // create
  orderId = await tradingRouter.decreaseLimitOrdersIndex();
  let request = {
    account: user0.address,
    pairIndex: 0,
    isLong: true,
    tpPrice: expandDecimals(90, 30),
    tp: expandDecimals(0, 18),
    slPrice: expandDecimals(110, 30),
    sl: expandDecimals(1, 18)
  };
  await tradingRouter.createTpSl(request)

  // execute
  await executeRouter.executeDecreaseOrder(orderId, 3);

  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)
  console.log(`reserve of btc: ${vault.indexReservedAmount}`);
  console.log(`reserve of usdt: ${vault.stableReservedAmount}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
