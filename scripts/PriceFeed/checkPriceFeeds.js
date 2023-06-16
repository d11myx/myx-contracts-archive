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
    console.log(repeatString('-'))
    const { symbol, priceFeed } = tokens[i]
    const latestRound = await priceFeed.latestRound()
    console.log(`user 0 isAdmin: ${await priceFeed.isAdmin(user0.address)}`)
    console.log(`user 1 isAdmin: ${await priceFeed.isAdmin(user1.address)}`)
    // let answer = await priceFeed.latestAnswer()
    let roundId = await priceFeed.latestRound()
    let roundData = await priceFeed.getRoundData(roundId)
    const answer = roundData[1]
    const updatedAt = roundData[3]

    console.log(`${symbol} : ${hre.ethers.utils.formatUnits(answer, priceDecimals)}, ${updatedAt}, ${updatedAt.sub(now).toString()}s, ${updatedAt.sub(now).div(60).toString()}m`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
