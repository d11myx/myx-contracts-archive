const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));
  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let pairLiquidity = await contractAt("PairLiquidity", await getConfig("PairLiquidity"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  console.log(`pairStorage: ${pairInfo.address}, pairVault: ${pairVault.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

  // mint token
  await btc.mint(user0.address, expandDecimals(100, 18))
  await usdt.mint(user0.address, expandDecimals(100, 18))
  await mintWETH(eth, user0.address, 100)

  // add liquidity
  await btc.approve(pairLiquidity.address, expandDecimals(100, 18));
  await usdt.approve(pairLiquidity.address, expandDecimals(100, 18));
  let pairIndex = await pairInfo.pairIndexes(btc.address, usdt.address);
  await pairLiquidity.setIndexTokenPrice(pairIndex, expandDecimals(100, 30));
  await pairLiquidity.addLiquidity(pairIndex, expandDecimals(100, 18), expandDecimals(100, 18));

  let pairToken = await contractAt("PairToken", (await pairInfo.pairs(pairIndex)).pairToken);
  let lpAmount = await pairLiquidity.userPairTokens(pairToken.address, user0.address);
  console.log(`lp supply: ${await pairToken.balanceOf(pairLiquidity.address)}, lp amount of user: ${lpAmount}`);
  console.log(`deposit fee btc: ${await btc.balanceOf(user1.address)}, usdt: ${await usdt.balanceOf(user1.address)}`);
  console.log(`slip fee btc: ${await btc.balanceOf(user2.address)}, usdt: ${await usdt.balanceOf(user2.address)}`);

  // remove liquidity
  await pairLiquidity.setIndexTokenPrice(pairIndex, expandDecimals(150, 30));
  await pairLiquidity.removeLiquidity(pairIndex, lpAmount.div(2));
  console.log(`balance of btc: ${await btc.balanceOf(pairVault.address)}, usdt: ${await usdt.balanceOf(pairVault.address)}`);
  lpAmount = await pairLiquidity.userPairTokens(pairToken.address, user0.address);
  console.log(`lp supply: ${await pairToken.balanceOf(pairLiquidity.address)}, lp amount of user: ${lpAmount}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
