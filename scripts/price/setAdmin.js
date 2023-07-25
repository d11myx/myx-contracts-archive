const { deployContract, contractAt, sendTxn } = require("../../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")
const {getConfig, repeatString} = require("../../utils");
const hre = require("hardhat");

async function main() {
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  const btcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-BTC"))
  const ethPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-ETH"))
  const usdcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-USDC"))
  const usdtPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-USDT"))
  const priceDecimals = 8

  const btc = {
    symbol: "BTC",
    address: await getConfig("Token-BTC"),
    priceFeed: btcPriceFeed
  }
  const eth = {
    symbol: "ETH",
    address: await getConfig("Token-ETH"),
    priceFeed: ethPriceFeed
  }
  const usdc = {
    symbol: "USDC",
    address: await getConfig("Token-USDC"),
    priceFeed: usdcPriceFeed
  }
  const usdt = {
    symbol: "USDT",
    address: await getConfig("Token-USDT"),
    priceFeed: usdtPriceFeed
  }

  const tokens = [btc, eth, usdc, usdt]

  const now = parseInt(Date.now() / 1000)

  for (let i = 0; i < tokens.length; i++) {
    const { symbol, priceFeed } = tokens[i]
    await priceFeed.setAdmin(user1.address, true)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
