const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairStorage = await contractAt("PairStorage", await getConfig("PairStorage"));
  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  console.log(`pairStorage: ${pairStorage.address}, pairVault: ${pairVault.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

  // mint token
  await btc.mint(user0.address, expandDecimals(100, 18))
  await usdt.mint(user0.address, expandDecimals(100, 18))
  await mintWETH(eth, user0.address, 100)

  // add liquidity
  await btc.approve(pairVault.address, expandDecimals(100, 18));
  await usdt.approve(pairVault.address, expandDecimals(100, 18));
  let pairIndex = await pairStorage.pairIndexes(btc.address, usdt.address);
  await pairVault.addLiquidity(pairIndex, expandDecimals(100, 18), expandDecimals(100, 18));

  let pairToken = await contractAt("PairToken", (await pairStorage.pairs(pairIndex)).pairToken);
  let lpAmount = await pairToken.balanceOf(user0.address);
  console.log(`lp amount: ${lpAmount}`);
  console.log(`deposit fee btc: ${await btc.balanceOf(user1.address)}, usdt: ${await usdt.balanceOf(user1.address)}`);
  console.log(`slip fee btc: ${await btc.balanceOf(user2.address)}, usdt: ${await usdt.balanceOf(user2.address)}`);

  // remove liquidity
  await pairVault.removeLiquidity(pairIndex, lpAmount.div(2));
  console.log(`balance of btc: ${await btc.balanceOf(pairVault.address)}, usdt: ${await usdt.balanceOf(pairVault.address)}`);
  lpAmount = await pairToken.balanceOf(user0.address);
  console.log(`lp amount: ${lpAmount}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
