const { deployContract, deployUpgradeableContract, toChainLinkPrice} = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");
async function main() {

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)


  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  let eth = await contractAt("Token", await getConfig("Token-ETH"))

  let btcPriceFeed = await deployContract("MockPriceFeed", ['BTC'])
  let usdtPriceFeed = await deployContract("MockPriceFeed", ['USDT'])
  let ethPriceFeed = await deployContract("MockPriceFeed", ['ETH'])

  let vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
  await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
  await vaultPriceFeed.setTokenConfig(usdt.address, usdtPriceFeed.address, 8, false)
  await vaultPriceFeed.setPriceSampleSpace(1);

  await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2000))
  await ethPriceFeed.setAdmin(user1.address, true)

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
  await btcPriceFeed.setAdmin(user1.address, true)

  await usdtPriceFeed.setLatestAnswer(toChainLinkPrice(1))
  await usdtPriceFeed.setAdmin(user1.address, true)



  let fastPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    120 * 60, // _maxPriceUpdateDelay
    2, // _minBlockInterval
    50, // _maxDeviationBasisPoints
    user0.address // _tokenManager
  ])
  console.log(`fastPriceFeed gov: ${await fastPriceFeed.gov()}`)
  await fastPriceFeed.initialize(2, [user0.address, user1.address], [user0.address, user1.address])
  await fastPriceFeed.setTokens([btc.address, eth.address], [10, 10])
  await fastPriceFeed.connect(user0).setPriceDataInterval(300)
  await fastPriceFeed.setMaxTimeDeviation(300)
  await fastPriceFeed.setUpdater(user0.address, true)
  await fastPriceFeed.setUpdater(user1.address, true)
  
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
