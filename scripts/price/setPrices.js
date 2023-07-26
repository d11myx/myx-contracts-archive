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

  // set oracle price
  let btcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-BTC"));
  let ethPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-ETH"));

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
  await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2000))

  // set keeper price
  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))
  let blockTime = await getBlockTime(provider)
  console.log(`lastUpdatedAt: ${await fastPriceFeed.lastUpdatedAt()}`)
  console.log(`lastUpdatedBlock: ${await fastPriceFeed.lastUpdatedBlock()}`)
  console.log(`blockTime: ${blockTime}`)
  console.log(`maxTimeDeviation: ${await fastPriceFeed.maxTimeDeviation()}`)
  console.log(`gov: ${await fastPriceFeed.gov()}`)

  // await fastPriceFeed.setMaxTimeDeviation(300);

  console.log(`btc: ${await fastPriceFeed.prices(await getConfig("Token-BTC"))}`)
  console.log(`eth: ${await fastPriceFeed.prices(await getConfig("Token-ETH"))}`)

  await fastPriceFeed.connect(user1).setPrices(
    [await getConfig("Token-BTC"), await getConfig("Token-ETH")],
    [expandDecimals(29990, 30), expandDecimals(1995, 30)],
    blockTime + 100)

  let tokens = ["BTC", "ETH"]
  let vaultPriceFeed = await contractAt("VaultPriceFeed", await getConfig("VaultPriceFeed"))
  for (let symbol of tokens) {
    console.log(repeatString('-'))
    console.log(symbol)
    let token = await getConfig("Token-" + symbol);
    let priceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-" + symbol))
    let decimals = await vaultPriceFeed.priceDecimals(token);
    let latestAnswer = await priceFeed.latestAnswer()
    console.log(`decimals: ${decimals}`)
    console.log(`oracle latestRound: ${await priceFeed.latestRound()}`)
    console.log(`oracle latestAnswer: ${latestAnswer} ${reduceDecimals(latestAnswer, decimals)}`)
    console.log(`fastPriceFeed price: ${reduceDecimals(await fastPriceFeed.prices(token), 30)}`);
    console.log(`vaultPriceFeed getPrimaryPrice: ${reduceDecimals(await vaultPriceFeed.getPrimaryPrice(token, true), 30)}`)
    console.log(`vaultPriceFeed getSecondaryPrice: ${reduceDecimals(await vaultPriceFeed.getSecondaryPrice(token, 0, true), 30)}`)
    console.log(`vaultPriceFeed max price: ${reduceDecimals(await vaultPriceFeed.getPrice(token, true, false, false), 30)}`)
    console.log(`vaultPriceFeed min price: ${reduceDecimals(await vaultPriceFeed.getPrice(token, false, false, false), 30)}`)
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
