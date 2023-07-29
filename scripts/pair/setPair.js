const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
  console.log("\n setPair")

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));
  let pairLiquidity = await contractAt("PairLiquidity", await getConfig("PairLiquidity"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  console.log(`pairInfo: ${pairInfo.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

  // btc - usdt
  await pairInfo.addPair(btc.address, usdt.address, pairLiquidity.address);
  let pairIndex = await pairInfo.pairIndexes(btc.address, usdt.address);
  let pairToken = (await pairInfo.pairs(pairIndex)).pairToken;
  console.log(`pair0 index: ${pairIndex} pairToken: ${pairToken}`);
  await setConfig("Token-BTC-USDT", pairToken);

  // eth - usdt
  await pairInfo.addPair(eth.address, usdt.address, pairLiquidity.address);
  pairIndex = await pairInfo.pairIndexes(eth.address, usdt.address);
  pairToken = (await pairInfo.pairs(pairIndex)).pairToken;
  console.log(`pair1 index: ${pairIndex} pairToken: ${pairToken}`);
  await setConfig("Token-ETH-USDT", pairToken);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
