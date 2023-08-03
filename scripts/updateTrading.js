const { deployContract, deployUpgradeableContract, updateContract} = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");

async function main() {

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));

  await updateContract("TradingVault", tradingVault.address);
  await updateContract("TradingRouter", tradingRouter.address);
  await updateContract("ExecuteRouter", executeRouter.address);


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
