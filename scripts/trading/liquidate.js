const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\nliquidate")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));
  let tradingUtils = await contractAt("TradingUtils", await getConfig("TradingUtils"));

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await vaultPriceFeed.setPrice(btc.address, expandDecimals(100, 30));

  console.log(`position: ${await tradingVault.getPosition(user0.address, 0, true)}`)

  await vaultPriceFeed.setPrice(btc.address, expandDecimals(120, 30));
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  let key = await tradingUtils.getPositionKey(user0.address, 0, false);

  console.log(`position: ${await tradingVault.getPositionByKey(key)}`)

  // execute
  let positionKeys = [key];
  let prices = [expandDecimals(120, 30)];
  await executeRouter.liquidatePositions(positionKeys, prices);

  console.log(`position: ${await tradingVault.getPositionByKey(key)}`)

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
