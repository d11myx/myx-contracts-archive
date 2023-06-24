const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
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
      kOfSwap: "100000000000000000000000000000000000000000000000000",
      enable: true,
      initPairRatio: 50*1e10,
      fee: {
        takerFeeP: 0,
        makerFeeP: 0,
        addLpFeeP: 1e10
      },
      tradingFeeDistribute: {
        lpP: 0,
        keeperP: 0,
        treasuryP: 0,
        refererP: 0
      },
      fundingFeeDistribute: {
        lpP: 0,
        userP: 0,
        treasuryP: 0
      }
    };
  console.log("pair0: ", pair);

  await pairInfo.addPair(pair);
  let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
  let pairToken = (await pairInfo.pairs(pairIndex)).pairToken;
  console.log(`pair0 index: ${pairIndex} pairToken: ${pairToken}`);
  await setConfig("Token-BTC-USDT", pairToken);

  //
  pair.indexToken = eth.address;
  console.log("pair1: ", pair);
  await pairInfo.addPair(pair);
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
