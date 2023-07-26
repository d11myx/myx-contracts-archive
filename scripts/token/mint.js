const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("../utils/utils");

async function main() {
  console.log("\n mint token")

  const [user0, user1, user2, user3, user4] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address} ${user4.address}`)

  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  let eth = await contractAt("WETH", await getConfig("Token-ETH"))

  for (let user of [user0, user1, user2, user3, user4]) {
    // await btc.mint(user.address, expandDecimals(1_000_000, 18))
    await usdt.mint(user.address, expandDecimals(1_000_000_000, 18))
    // await mintWETH(eth, user.address, 1_000_000)
    console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(user.address))}`);
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
