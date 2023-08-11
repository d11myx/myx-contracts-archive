const { deployContract, deployUpgradeableContract } = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairInfo = await contractAt("Pool", await getConfig("Pool"));
  let pairVault = await contractAt("PoolVault", await getConfig("PoolVault"));
  let vaultPriceFeed = await contractAt("OraclePriceFeed", await getConfig("OraclePriceFeed"));
  let fastPriceFeed = await contractAt("IndexPriceFeed", await getConfig("IndexPriceFeed"));


  let args = [pairInfo.address, pairVault.address, user1.address, 8 * 60 * 60];
  let tradingVault = await deployUpgradeableContract("PositionManager", args);

  args = [pairInfo.address, pairVault.address, tradingVault.address,];
  let tradingRouter = await deployUpgradeableContract("TradingRouter", args);

  args = [pairInfo.address, pairVault.address, tradingVault.address, tradingRouter.address, fastPriceFeed.address, 60];
  let executeRouter = await deployUpgradeableContract("ExecuteRouter", args);

//   await tradingUtils.setContract(pairInfo.address, pairVault.address, tradingVault.address, tradingRouter.address, vaultPriceFeed.address);

  await pairVault.setHandler(tradingVault.address, true);
  await tradingVault.setHandler(executeRouter.address, true);
  await tradingRouter.setHandler(executeRouter.address, true);
  await executeRouter.setPositionKeeper(user0.address, true);
  await executeRouter.setPositionKeeper(user1.address, true);

  await fastPriceFeed.setUpdater(executeRouter.address, true);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
