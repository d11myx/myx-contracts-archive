const { deployContract, deployUpgradeableContract } = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairStorage = await deployContract("PairStorage", []);
  await pairStorage.initialize();

  let ethAddress = await getConfig("Token-ETH");
  let pairVault = await deployContract("PairVault", []);

  await pairVault.initialize(pairStorage.address, user1.address, user2.address, ethAddress);

  await pairVault.setHandler(pairStorage.address, true);
  await pairStorage.setPairVault(pairVault.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
