const { deployContract, deployUpgradeableContract, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, reduceDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig, repeatString} = require("../utils/utils");
const {contractAt} = require("../utils/helpers");
const {BigNumber} = require("ethers");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  console.log("\n query price")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  console.log(`start...`)

  let eth = await contractAt("Token", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  let tokens = ["BTC", "ETH"]
  let vaultPriceFeed = await contractAt("VaultPriceFeed", await getConfig("VaultPriceFeed"))
  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))

  for (let symbol of tokens) {
    console.log(repeatString('-'))
    console.log(symbol)
    let token = await getConfig("Token-" + symbol);
    let priceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-" + symbol))
    let decimals = await vaultPriceFeed.priceDecimals(token);
    let lastRound = await priceFeed.latestRound();
    console.log(`decimals: ${decimals}`)
    console.log(`oracle latestRound: ${lastRound} latestAnswer: ${reduceDecimals(await priceFeed.latestAnswer(), decimals)}`)
    if (lastRound >= 3) {
      console.log(`oracle round: ${lastRound - 1} latestAnswer: ${reduceDecimals((await priceFeed.getRoundData(lastRound - 1))[1], decimals)}`)
      console.log(`oracle round: ${lastRound - 2} latestAnswer: ${reduceDecimals((await priceFeed.getRoundData(lastRound - 2))[1], decimals)}`)
    }
    console.log(`fastPriceFeed price: ${reduceDecimals(await fastPriceFeed.prices(token), 30)}`);
    console.log(`vaultPriceFeed getPrimaryPrice: ${reduceDecimals(await vaultPriceFeed.getPrimaryPrice(token, true), 30)}`)
    console.log(`vaultPriceFeed getSecondaryPrice: ${reduceDecimals(await vaultPriceFeed.getSecondaryPrice(token, 0, true), 30)}`)
    console.log(`vaultPriceFeed price: ${reduceDecimals(await vaultPriceFeed.getPrice(token, true, false, false), 30)}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
