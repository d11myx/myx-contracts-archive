const { deployContract, deployUpgradeableContract } = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));
  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let pairLiquidity = await contractAt("PairLiquidity", await getConfig("PairLiquidity"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

  let args = [pairInfo.address, pairVault.address, vaultPriceFeed.address, user1.address];
  let tradingVault = await deployUpgradeableContract("TradingVault", args);

  args = [pairInfo.address, pairVault.address, tradingVault.address, vaultPriceFeed.address];
  let tradingRouter = await deployUpgradeableContract("TradingRouter", args);

  args = [pairInfo.address, pairVault.address, tradingVault.address, tradingRouter.address, vaultPriceFeed.address, 60];
  let executeRouter = await deployUpgradeableContract("ExecuteRouter", args);

  await pairVault.setHandler(tradingVault.address, true);
  await tradingVault.setHandler(executeRouter.address, true);
  await tradingRouter.setHandler(executeRouter.address, true);
  await executeRouter.setPositionKeeper(user0.address, true);
  await executeRouter.setPositionKeeper(user1.address, true);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
