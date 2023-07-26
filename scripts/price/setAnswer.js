const { deployContract, deployUpgradeableContract, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, reduceDecimals } = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig, repeatString} = require("../utils/utils");
const {contractAt} = require("../utils/helpers");
const {BigNumber} = require("ethers");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  console.log(`start...`)


  let eth = await contractAt("Token", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  let btcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-BTC"));
  let ethPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-ETH"));

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(29250))
  await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2000))

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
    console.log(`latestRound: ${await priceFeed.latestRound()}`)
    console.log(`latestAnswer: ${latestAnswer} ${hre.ethers.utils.formatUnits(latestAnswer, decimals)}`)
    console.log(`getLatestPrimaryPrice: ${await vaultPriceFeed.getLatestPrimaryPrice(token)}`)
    console.log(`getPrimaryPrice: ${hre.ethers.utils.formatEther(await vaultPriceFeed.getPrimaryPrice(token, false))}`)
    console.log(`vaultPriceFeed price: ${hre.ethers.utils.formatUnits(await vaultPriceFeed.getPrice(token, true, false, false), 30)}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
