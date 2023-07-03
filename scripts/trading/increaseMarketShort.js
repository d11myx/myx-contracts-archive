const { deployContract, contractAt } = require("../utils/helpers");
const { expandDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  const addresses = {}

  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

  // market
  let btc = await contractAt("Token", await getConfig("Token-BTC"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  await usdt.mint(user0.address, expandDecimals(100, 18))
  await vaultPriceFeed.setPrice(btc.address, expandDecimals(100, 30));

  await usdt.approve(tradingRouter.address, expandDecimals(100, 30));

  let request = {
    account: user0.address,
    pairIndex: 0,
    tradeType: 0,
    collateral: expandDecimals(50, 18),
    openPrice: expandDecimals(100, 30),
    isLong: false,
    sizeDelta: expandDecimals(100, 18),
    tpPrice: expandDecimals(50, 30),
    tp: expandDecimals(100, 18),
    slPrice: expandDecimals(150, 30),
    sl: expandDecimals(100, 18)
  };
  await tradingRouter.createIncreasePosition(request);

  let requestIndex = (await tradingRouter.increaseMarketRequestsIndex()).sub(1);
  console.log(`request: ${await tradingRouter.increaseMarketRequests(requestIndex)}`)
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);

  // market
  await tradingRouter.executeIncreasePosition(requestIndex, 0)

  console.log(`request: ${await tradingRouter.increaseMarketRequests(requestIndex)}`);
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingRouter.address)}`);
  console.log(`balance of usdt: ${await usdt.balanceOf(tradingVault.address)}`);
  console.log(`reserve of btc: ${await usdt.balanceOf(pairVault.address)}`);
  console.log(`balance of usdt: ${await usdt.balanceOf(pairVault.address)}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
