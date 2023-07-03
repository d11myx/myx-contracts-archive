const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  console.log(`pairStorage: ${pairInfo.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

  let pair = {
    indexToken: btc.address,
    stableToken: usdt.address,
    pairToken: "0x0000000000000000000000000000000000000000",
    enable: true,
    kOfSwap: "100000000000000000000000000000000000000000000000000",
    initPairRatio: 1000,
  };
  let tradingConfig = {
    minLeverage: 2,
    maxLeverage: 100,
    minSize: "1000000000000000000",
    maxSize: "1000000000000000000000",
  }
  let feePercentage = {
    takerFeeP: 100, // 1%
    makerFeeP: 100,
    addLpFeeP: 100
  }
  let tradingFeeDistribute = {
    lpP: 0,
    keeperP: 0,
    treasuryP: 0,
    refererP: 0
  }
  let fundingFeeDistribute = {
    lpP: 0,
    userP: 0,
    treasuryP: 0
  }
  console.log("pair0", pair, "\ntradingConfig", tradingConfig, "\nfeePercentage", feePercentage,
    "\ntradingFeeDistribute", tradingFeeDistribute, "\nfundingFeeDistribute", fundingFeeDistribute);
  await pairInfo.addPair(pair, tradingConfig, feePercentage, tradingFeeDistribute, fundingFeeDistribute);
  let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
  let pairToken = (await pairInfo.pairs(pairIndex)).pairToken;
  console.log(`pair0 index: ${pairIndex} pairToken: ${pairToken}`);
  await setConfig("Token-BTC-USDT", pairToken);

  //
  pair.indexToken = eth.address;
  console.log("pair1: ", pair);
  await pairInfo.addPair(pair, tradingConfig, feePercentage, tradingFeeDistribute, fundingFeeDistribute);
  pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
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
