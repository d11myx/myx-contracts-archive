const { toChainLinkPrice} = require("../utils/helpers");
const { expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const hre = require("hardhat");
const {ethers} = require("hardhat");
const {getRouter, getOrderManager, getExecutor, getOraclePriceFeed, getRoleManager, getPool, getIndexPriceFeed,
  getMockPriceFeed, getToken, getMockToken, getPositionManager
} = require("../../helpers");

async function main() {
  console.log("\n increaseMarketLong")
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
  await usdt.mint(trader.address, expandDecimals(30000, 18))
  await usdt.connect(trader).approve(orderManager.address, expandDecimals(30000, 30));

  await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
  await indexPriceFeed.connect(keeper).setPrices([btc.address],
    [expandDecimals(30000, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  let orderId = await tradingRouter.increaseMarketOrdersIndex();
  let request = {
    account: trader.address,
    pairIndex: 0,
    tradeType: 0,
    collateral: expandDecimals(30000, 18),
    openPrice: expandDecimals(30000, 30),
    isLong: true,
    sizeAmount: expandDecimals(10, 18),
    tpPrice: expandDecimals(31000, 30),
    tp: expandDecimals(1, 18),
    slPrice: expandDecimals(29000, 30),
    sl: expandDecimals(1, 18)
  };
  await router.connect(trader).createIncreaseOrder(request)

  console.log(`order: ${await orderManager.increaseMarketOrders(orderId)}`)
  console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(router.address))}`);

  // execute
  let startIndex = await executor.increaseMarketOrderStartIndex();
  console.log("startIndex:", startIndex, "orderId:", orderId);
  await executor.executeIncreaseOrder(orderId, 0);
  // await executor.executeIncreaseMarketOrders(orderId.add(1));
  console.log(`order after execute: ${await orderManager.increaseMarketOrders(orderId)}`);
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
