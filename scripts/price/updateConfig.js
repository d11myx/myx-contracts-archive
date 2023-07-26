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

  await fastPriceFeed.setVaultPriceFeed(vaultPriceFeed.address);
  await vaultPriceFeed.setSecondaryPriceFeed(fastPriceFeed.address);
  await vaultPriceFeed.setIsSecondaryPriceEnabled(false);

  for (let i = 10; i < signers.length; i++) {
      await fastPriceFeed.setUpdater(signers[i].address, true)
      console.log("set updater:", signers[i].address)
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
