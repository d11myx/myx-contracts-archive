const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n liquidate")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-BTC"));
  let tradingUtils = await contractAt("TradingUtils", await getConfig("TradingUtils"));
  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))

  // create
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  console.log(`position: ${await tradingVault.getPosition(user3.address, 0, true)}`)

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(35000))
  await fastPriceFeed.connect(user1).setPrices([await getConfig("Token-BTC")],
    [expandDecimals(35000, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  let key = await tradingUtils.getPositionKey(user3.address, 0, false);

  console.log(`position: ${await tradingVault.getPositionByKey(key)}`)

  // execute
  let positionKeys = [key];
  await executeRouter.liquidatePositions(positionKeys);

  console.log(`position: ${await tradingVault.getPositionByKey(key)}`)
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
