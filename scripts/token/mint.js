const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("../utils/utils");

async function main() {
  console.log("\n mint token")

  const signers = await hre.ethers.getSigners()

  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  let eth = await contractAt("WETH", await getConfig("Token-ETH"))

  for (let user of signers) {
    await btc.mint(user.address, expandDecimals(1000, 18))
    await usdt.mint(user.address, expandDecimals(10000000, 18))
    // await mintWETH(eth, user.address, 1_000_000)
    console.log(`usdt balance of ${user.address} : ${formatBalance(await usdt.balanceOf(user.address))}`);
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
