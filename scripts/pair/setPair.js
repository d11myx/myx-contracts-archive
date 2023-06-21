const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
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
      spreadP: 0,
      k: "100000000000000000000000000000000000000000000000000",
      minLeverage: 2,
      maxLeverage: 100,
      maxCollateralP: 0,
      enable: true,
      fee: {
        openFeeP: 0,
        closeFeeP: 0,
        oracleFeeP: 0,
        nftLimitOrderFeeP: 0,
        referralFeeP: 0,
        minLevPosDai: 0,
        depositFeeP: 10000000000
      }
    };
  console.log("pair0: ", pair);

  await pairInfo.addPair(pair);
  let pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
  console.log(`pair0 index: ${pairIndex} pairToken: ${(await pairInfo.pairs(pairIndex)).pairToken}`);

  //
  pair.indexToken = eth.address;
  console.log("pair1: ", pair);
  await pairInfo.addPair(pair);
  pairIndex = await pairInfo.pairIndexes(pair.indexToken, pair.stableToken);
  console.log(`pair1 index: ${pairIndex} pairToken: ${(await pairInfo.pairs(pairIndex)).pairToken}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
