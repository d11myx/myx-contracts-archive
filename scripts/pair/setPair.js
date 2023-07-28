const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

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
    kOfSwap: expandDecimals(1, 50),
    initPrice: expandDecimals(30000, 30),
    addLpFeeP: 100
  };
  let tradingConfig = {
    minLeverage: 0,
    maxLeverage: 100,
    minTradeAmount: "1000000000000000",
    maxTradeAmount: "100000000000000000000000",
    maxPositionAmount: "100000000000000000000000000",
    maintainMarginRate: 1000,
    priceSlipP: 100,
    maxPriceDeviationP: 50
  }
  let tradingFeeConfig = {
    takerFeeP: 10, // 0.1%
    makerFeeP: 10,
    lpDistributeP: 0,
    keeperDistributeP: 0,
    treasuryDistributeP: 10000,
    refererDistributeP: 0
  }
  let fundingFeeConfig = {
    minFundingRate: 100,
    maxFundingRate: 10000,
    fundingWeightFactor: 100,
    liquidityPremiumFactor: 10000,
    interest: 0,
    lpDistributeP: 0,
    userDistributeP: 10000,
    treasuryDistributeP: 0
  }
  console.log("pair0", pair, "\ntradingConfig", tradingConfig, "\ntradingFeeConfig", tradingFeeConfig,
    "\nfundingFeeConfig", fundingFeeConfig);
  // btc - usdt
  await pairInfo.addPair(pair, tradingConfig, tradingFeeConfig, fundingFeeConfig);
  let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
  let pairToken = (await pairInfo.pairs(pairIndex)).pairToken;
  console.log(`pair0 index: ${pairIndex} pairToken: ${pairToken}`);
  await setConfig("Token-BTC-USDT", pairToken);

  // eth - usdt
  pair.indexToken = eth.address;
  pair.initPrice = expandDecimals(2000, 30);
  console.log("pair1: ", pair);
  await pairInfo.addPair(pair, tradingConfig, tradingFeeConfig, fundingFeeConfig);
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
