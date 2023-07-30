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
  console.log("\n updateConfig")
  const signers = await hre.ethers.getSigners()

  let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))
  let vaultPriceFeed = await contractAt("VaultPriceFeed", await getConfig("VaultPriceFeed"))
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-BTC"));
  let ethPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-ETH"));
  let usdtPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-USDT"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));

  await executeRouter.setMaxTimeDelay(5 * 60);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
