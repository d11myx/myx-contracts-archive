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

  let fastPriceFeed = await contractAt("IndexPriceFeed", await getConfig("IndexPriceFeed"))
  let vaultPriceFeed = await contractAt("OraclePriceFeed", await getConfig("OraclePriceFeed"))
  let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("MockPriceFeed-BTC"));
  let ethPriceFeed = await contractAt("MockPriceFeed", await getConfig("MockPriceFeed-ETH"));
  let usdtPriceFeed = await contractAt("MockPriceFeed", await getConfig("MockPriceFeed-USDT"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));

  let roleManager = await contractAt('RoleManager', await getConfig("RoleManager"));

  await vaultPriceFeed.setIndexPriceFeed(fastPriceFeed.address);

  for (let i = 10; i < signers.length; i++) {
      await roleManager.addKeeper(signers[i].address)
      await btcPriceFeed.setAdmin(signers[i].address, true)
      await usdtPriceFeed.setAdmin(signers[i].address, true)
      await ethPriceFeed.setAdmin(signers[i].address, true)
      await executeRouter.setPositionKeeper(signers[i].address, true);
      console.log("add keeper:", signers[i].address)
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
