const { deployContract, deployUpgradeableContract, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, getBlockTime, reduceDecimals} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig, repeatString} = require("../utils/utils");
const {contractAt} = require("../utils/helpers");
const {BigNumber} = require("ethers");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  console.log("\n setPrices")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
  const provider = await hre.ethers.provider

  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))
  let blockTime = await getBlockTime(provider)
  console.log(`lastUpdatedAt: ${await fastPriceFeed.lastUpdatedAt()}`)
  console.log(`lastUpdatedBlock: ${await fastPriceFeed.lastUpdatedBlock()}`)
  console.log(`blockTime: ${blockTime}`)
  console.log(`maxTimeDeviation: ${await fastPriceFeed.maxTimeDeviation()}`)
  console.log(`gov: ${await fastPriceFeed.gov()}`)

  await fastPriceFeed.setMaxTimeDeviation(300);

  console.log(`btc: ${await fastPriceFeed.prices(await getConfig("Token-BTC"))}`)
  console.log(`eth: ${await fastPriceFeed.prices(await getConfig("Token-ETH"))}`)

  let setPriceTrx =await fastPriceFeed.connect(user1).setPrices(
    [await getConfig("Token-BTC"), await getConfig("Token-ETH")],
    [expandDecimals(29900, 30), expandDecimals(1990, 30)],
    blockTime + 100)

  console.log(`setPrices: ${setPriceTrx.hash}`)
  console.log(`btc: ${reduceDecimals(await fastPriceFeed.prices(await getConfig("Token-BTC")), 30)}`);
  console.log(`eth: ${reduceDecimals(await fastPriceFeed.prices(await getConfig("Token-ETH")), 30)}`);

  // await expect(fastPriceFeed.connect(updater0).setPrices([btc.address, eth.address, bnb.address],
  //   [expandDecimals(60000, 30), expandDecimals(5000, 30), expandDecimals(700, 30)], blockTime + 100))
  //   .to.be.revertedWith("FastPriceFeed: _timestamp exceeds allowed range")

  // await fastPriceFeed.setMaxTimeDeviation(200)
  //
  // await fastPriceFeed.connect(updater0).setPrices([btc.address, eth.address, bnb.address], [expandDecimals(60000, 30), expandDecimals(5000, 30), expandDecimals(700, 30)], blockTime + 100)
  // const blockNumber0 = await provider.getBlockNumber()

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
