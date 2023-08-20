const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");
const {ethers} = require("hardhat");
const {
  getRouter,
  getExecutor,
  getOrderManager,
  getPositionManager,
  getIndexPriceFeed,
  getMockPriceFeed,
  getRoleManager,
  getPool,
  getMockToken,
  getToken
} = require("../../helpers");

async function main() {
  console.log("\n decreaseMarketLong")

  const [keeper, trader] = await ethers.getSigners();


  const router = await getRouter();
  const executor = await getExecutor();
  const orderManager = await getOrderManager();
  const positionManager = await getPositionManager();
  const indexPriceFeed = await getIndexPriceFeed();
  const btcPriceFeed = await getMockPriceFeed("BTC");
  const roleManager = await getRoleManager();
  const pool = await getPool();

  const btc = await getMockToken("BTC")
  const usdt = await getToken()

  // create
  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(31000))
  await indexPriceFeed.connect(keeper).setPrices([btc.address],
    [expandDecimals(31000, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  console.log(`position: ${await positionManager.getPosition(trader.address, 0, true)}`)

  let orderId = await tradingRouter.decreaseMarketOrdersIndex();
  let request = {
    account: trader.address,
    pairIndex: 0,
    tradeType: 0,
    collateral: expandDecimals(-3000, 18),
    triggerPrice: expandDecimals(31000, 30),
    sizeAmount: expandDecimals(1, 18),
    isLong: true
  };
  await router.connect(trader).createDecreaseOrder(request)

  console.log(`order: ${await orderManager.decreaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(router.address))}`);

  // execute
  let startIndex = await tradingRouter.decreaseMarketOrdersIndex();
  console.log("startIndex:", startIndex);
  await executor.executeDecreaseOrder(orderId, 0);
  // await executor.executeDecreaseMarketOrders(orderId.add(1));
  console.log(`order after execute: ${await orderManager.decreaseMarketOrders(orderId)}`);
  console.log(`position: ${await positionManager.getPosition(trader.address, 0, true)}`)
  console.log(`btc balance of position manager: ${formatBalance(await btc.balanceOf(positionManager.address))}`);
  console.log(`usdt balance of position manager: ${formatBalance(await usdt.balanceOf(positionManager.address))}`);

  let vault = await pool.getVault(0);
  console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} reserve of btc: ${formatBalance(vault.indexReservedAmount)}`);
  console.log(`total usdt: ${formatBalance(vault.stableTotalAmount)}  reserve of usdt: ${formatBalance(vault.stableReservedAmount)}`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
