const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")
const { initVault, getBtcConfig, getUSDTConfig, getUSDCConfig, getEthConfig} = require("../../test/core/Vault/helpers")
const { expandDecimals, reportGasUsed, gasUsed } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../test/shared/units")
const { getDefault, validateOrderFields, getTxFees, positionWrapper, defaultCreateIncreaseOrderFactory } = require('../../test/core/OrderBook/helpers');

const hre = require("hardhat");
const {getConfig} = require("../utils");

async function main() {

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)


  let vaultPriceFeed = await contractAt("VaultPriceFeed", await getConfig("VaultPriceFeed"))

  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let btcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-BTC"))

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let ethPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-ETH"))

  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  let usdtPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-USDT"))

  let usdc = await contractAt("Token", await getConfig("Token-USDC"))
  let usdcPriceFeed = await contractAt("PriceFeed", await getConfig("PriceFeed-USDC"))

  let vault = await contractAt("Vault", await getConfig("Vault"))
  let timelock = await deployContract("Timelock", [
    user0.address, // _admin
    5 * 24 * 60 * 60, // _buffer
    user0.address, // _tokenManager
    user0.address, // _mintReceiver
    user0.address, // _glpManager
    user1.address, // _rewardRouter
    expandDecimals(1000, 18), // _maxTokenSupply
    10, // marginFeeBasisPoints 0.1%
    500, // maxMarginFeeBasisPoints 5%
  ])

  // let usdg = await contractAt("USDG", await getConfig("USDG"))
  // let router = await contractAt("Router", await getConfig("Router"))

  let fastPriceEvents = await deployContract("FastPriceEvents", [])
  let fastPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    120 * 60, // _maxPriceUpdateDelay
    2, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    user0.address // _tokenManager
  ])
  await fastPriceFeed.initialize(2, [user0.address, user1.address], [user0.address, user1.address])
  await fastPriceFeed.setTokens([btc.address, eth.address], [10, 10])
  await fastPriceFeed.connect(user0).setPriceDataInterval(300)
  await fastPriceFeed.setMaxTimeDeviation(1000)
  await fastPriceFeed.setUpdater(user0.address, true)
  await fastPriceFeed.setUpdater(user1.address, true)
  await fastPriceEvents.setIsPriceFeed(fastPriceFeed.address, true)

  console.log(`vault gov: ${await vault.gov()}`)


  await vault.setIsLeverageEnabled(false)
  await vault.setGov(timelock.address)

  // await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 18, false)
  // await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 18, false)
  // await vaultPriceFeed.setTokenConfig(usdt.address, usdtPriceFeed.address, 18, false)
  // await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 18, false)


  // for later use
  let positionUtils = await deployContract("PositionUtils", [])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
