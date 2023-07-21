const { deployContract, deployUpgradeableContract } = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))

  let vaultPriceFeed = await contractAt("VaultPriceFeed", await getConfig("VaultPriceFeed"));

  let pairInfo = await deployUpgradeableContract("PairInfo", []);
  let pairVault = await deployUpgradeableContract("PairVault", [pairInfo.address]);

  let pairLiquidity = await deployUpgradeableContract("PairLiquidity",
    [pairInfo.address, pairVault.address, vaultPriceFeed.address, user1.address, user2.address, eth.address]);

  await pairLiquidity.setHandler(pairInfo.address, true);
  await pairVault.setHandler(pairLiquidity.address, true);
  await pairInfo.setPairLiquidity(pairLiquidity.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
