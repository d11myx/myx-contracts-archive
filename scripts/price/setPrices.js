const { deployContract, deployUpgradeableContract, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, getBlockTime, reduceDecimals} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig, repeatString} = require("../utils/utils");
const {contractAt} = require("../utils/helpers");
const {BigNumber} = require("ethers");
const {getMockPriceFeed, getIndexPriceFeed, getOraclePriceFeed, getMockToken} = require("../../helpers");
const {ethers} = require("hardhat");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  console.log("\n setPrices")
  const [keeper] = await ethers.getSigners();

  console.log(`keeper: ${keeper.address}`)
  const provider = await hre.ethers.provider

  // set oracle price
  const btcPriceFeed = await getMockPriceFeed("BTC");
  const ethPriceFeed = await getMockPriceFeed("ETH");

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
  await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2000))

  // set keeper price
  const indexPriceFeed = await getIndexPriceFeed();
  let blockTime = await getBlockTime(provider)
  console.log(`lastUpdatedAt: ${await indexPriceFeed.lastUpdatedAt()}`)
  console.log(`blockTime: ${blockTime}`)
  console.log(`maxTimeDeviation: ${await indexPriceFeed.maxTimeDeviation()}`)

  // await fastPriceFeed.setMaxTimeDeviation(300);
  let btc = await getMockToken("BTC");
  let eth = await getMockToken("ETH");

  console.log(`btc: ${await indexPriceFeed.prices(btc.address)}`)
  console.log(`eth: ${await indexPriceFeed.prices(eth.address)}`)

  await indexPriceFeed.connect(keeper).setPrices(
    [btc.address, eth.address],
    [expandDecimals(30000, 30), expandDecimals(2000, 30)],
    blockTime + 100)

  let tokens = ["BTC", "ETH"]
  let oraclePriceFeed = await getOraclePriceFeed()
  for (let symbol of tokens) {
    console.log(repeatString('-'))
    console.log(symbol)
    let token = (await getMockToken(symbol)).address;
    let priceFeed = await getMockPriceFeed(symbol)
    let decimals = await oraclePriceFeed.priceDecimals(token);
    let latestAnswer = await priceFeed.latestAnswer()
    console.log(`decimals: ${decimals}`)
    console.log(`oracle latestRound: ${await priceFeed.latestRound()}`)
    console.log(`oracle latestAnswer: ${latestAnswer} ${reduceDecimals(latestAnswer, decimals)}`)
    console.log(`fastPriceFeed price: ${reduceDecimals(await indexPriceFeed.prices(token), 30)}`);
    console.log(`vaultPriceFeed getPrimaryPrice: ${reduceDecimals(await oraclePriceFeed.getPrimaryPrice(token), 30)}`)
    console.log(`vaultPriceFeed getIndexPrice: ${reduceDecimals(await oraclePriceFeed.getIndexPrice(token, 0), 30)}`)
    console.log(`vaultPriceFeed price: ${reduceDecimals(await oraclePriceFeed.getPrice(token), 30)}`)
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
