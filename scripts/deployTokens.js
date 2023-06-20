const { deployContract } = require("./utils/helpers");
const { expandDecimals } = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH} = require("./utils/utils");

async function main() {
  const addresses = {}
  // addresses.BTC = (await callWithRetries(deployContract, ["FaucetToken", ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)]])).address
  // addresses.USDC = (await callWithRetries(deployContract, ["FaucetToken", ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)]])).address
  // addresses.USDT = (await callWithRetries(deployContract, ["FaucetToken", ["Tether", "USDT", 18, expandDecimals(1000, 18)]])).address
  // addresses.ETH = (await callWithRetries(deployContract, ["FaucetToken", ["ETH", "ETH", 18, expandDecimals(1000, 18)]])).address
  // addresses.WETH = (await callWithRetries(deployContract, ["WETH", ["WETH", "WETH", 18]])).address

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let btc = await deployContract("Token", ["BTC"])
  let usdt = await deployContract("Token", ["USDT"])
  let eth = await deployContract("WETH", ["WETH", "WETH", 18])
  // for (let user of [user0, user1, user2, user3]) {
  //   await btc.mint(user.address, expandDecimals(1_000_000, 18))
  //   await usdc.mint(user.address, expandDecimals(1_000_000, 18))
  //   await usdt.mint(user.address, expandDecimals(1_000_000, 18))
  //   await mintWETH(eth, user.address, 1_000_000)
  // }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
