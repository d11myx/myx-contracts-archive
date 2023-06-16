const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../../test/core/Vault/helpers")
const { expandDecimals, getBlockTime, reportGasUsed, gasUsed } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../test/shared/units")
const { getDefault, validateOrderFields, getTxFees, positionWrapper, defaultCreateIncreaseOrderFactory } = require('../../test/core/OrderBook/helpers');

const hre = require("hardhat");
const {getConfig} = require("../utils");
const {expect} = require("chai");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
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

  let setMaxTimeDeviation = await fastPriceFeed.setMaxTimeDeviation(300);

  // let setPriceTrx = await fastPriceFeed.connect(updater0).setPrices(
  //   [await getConfig("Token-BTC"), await getConfig("Token-ETH")],
  //   [expandDecimals(6000, 18), expandDecimals(500, 18)], blockTime + 100
  // )
  // console.log(`setPrices: ${setPriceTrx.hash}`)

  console.log(`btc: ${await fastPriceFeed.prices(await getConfig("Token-BTC"))}`)
  console.log(`eth: ${await fastPriceFeed.prices(await getConfig("Token-ETH"))}`)
  // await fastPriceFeed.connect(updater0).setPrices([await getConfig("BTC"), await getConfig("ETH")],
  //   [expandDecimals(60000, 30), expandDecimals(5000, 30), expandDecimals(700, 30)], blockTime + 100)

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
