const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\ndecreaseLimitShort")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await vaultPriceFeed.setPrice(btc.address, expandDecimals(110, 30));

  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)

  let orderId = await tradingRouter.decreaseLimitOrdersIndex();
  let request = {
    pairIndex: 0,
    tradeType: 1,
    triggerPrice: expandDecimals(110, 30),
    sizeAmount: expandDecimals(1, 18),
    isLong: false
  };
  await tradingRouter.createDecreaseOrder(request)

  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`)
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  // execute
  await tradingRouter.connect(user1).executeDecreaseOrder(orderId, 1);

  console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`);
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);
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
