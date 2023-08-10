const { deployContract, contractAt, toChainLinkPrice} = require("../utils/helpers");
const { bigNumberify, expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n ADL test")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("PositionManager", await getConfig("PositionManager"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let ethPriceFeed = await contractAt("MockPriceFeed", await getConfig("PriceFeed-ETH"));

  let fastPriceFeed = await contractAt("IndexPriceFeed", await getConfig("IndexPriceFeed"))

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  // await usdt.mint(user0.address, expandDecimals(100, 18))
  await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2100))
  await fastPriceFeed.connect(user1).setPrices([eth.address],
    [expandDecimals(2100, 30)],
    await getBlockTime(await hre.ethers.provider) + 100)

  await usdt.approve(tradingRouter.address, expandDecimals(10000, 30));

  // increase long
  console.log("\n increase long")
  await executeOrder(true, user0, true, expandDecimals(1200000, 18), expandDecimals(6000, 18));

  // increase short
  console.log("\n increase short")
  await executeOrder(true, user0, false, expandDecimals(1200000, 18), expandDecimals(6000, 18));

  // increase long
  console.log("\n increase long")
  await executeOrder(true, user0, true, expandDecimals(1200000, 18), expandDecimals(6000, 18));

  // decrease short
  console.log("\n decrease short")
  let orderId = await executeOrder(false, user0, false, 0, expandDecimals(6000, 18));

  // ADL
  console.log("\n execute ADL")
  let pairIndex = 1;
  let positionKey = await tradingVault.getPositionKey(user0.address, pairIndex, true);
  let position = await tradingVault.getPosition(user0.address, pairIndex, false);
  console.log(`position before ADL: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)
  console.log(`position collateral: ${formatBalance(position.collateral)} amount: ${formatBalance(position.positionAmount)}`);
  await executeRouter.executeADLAndDecreaseOrder([positionKey], [expandDecimals(6000, 18)], orderId, 0);
  console.log(`position after ADL: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)
  console.log(`order after execute: ${await tradingRouter.decreaseMarketOrders(orderId)}`);

  console.log(`position after execute: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)

  console.log(`eth balance: ${formatBalance(await eth.balanceOf(tradingVault.address))}`,
              `usdt balance: ${formatBalance(await usdt.balanceOf(tradingVault.address))}`);

  let vault = await pairVault.getVault(pairIndex);
  console.log(`eth totalAmount: ${formatBalance(vault.indexTotalAmount)} indexReservedAmount ${formatBalance(vault.indexReservedAmount)} `);
  console.log(`usdt totalAmount: ${formatBalance(vault.stableTotalAmount)} stableReservedAmount ${formatBalance(vault.stableReservedAmount)} `);

}

async function executeOrder(isIncrease, user, isLong, collateral, sizeAmount) {
  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("PositionManager", await getConfig("PositionManager"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))

  let pairIndex = 1;
  let orderId;
  if (isIncrease) {
    orderId = await tradingRouter.increaseMarketOrdersIndex();
    let request = {
      account: user.address,
      pairIndex: pairIndex,
      tradeType: 0,
      collateral: collateral,
      openPrice: expandDecimals(2100, 30),
      isLong: isLong,
      sizeAmount: sizeAmount,
      tpPrice: expandDecimals(0, 30),
      tp: expandDecimals(0, 18),
      slPrice: expandDecimals(0, 30),
      sl: expandDecimals(0, 18)
    };
    await tradingRouter.createIncreaseOrder(request)

    console.log(`order: ${await tradingRouter.increaseMarketOrders(orderId)}`)

    // execute
    // await executeRouter.executeIncreaseOrder(orderId, 0);
    await executeRouter.executeIncreaseMarketOrders(orderId.add(1));

    console.log(`order after execute: ${await tradingRouter.increaseMarketOrders(orderId)}`);
  } else {
    orderId = await tradingRouter.decreaseMarketOrdersIndex();
    let request = {
      account: user.address,
      pairIndex: pairIndex,
      tradeType: 0,
      collateral: collateral,
      triggerPrice: expandDecimals(2100, 30),
      sizeAmount: sizeAmount,
      isLong: isLong
    };
    await tradingRouter.createDecreaseOrder(request)

    console.log(`order: ${await tradingRouter.decreaseMarketOrders(orderId)}`)

    // execute
    // await executeRouter.executeDecreaseOrder(orderId, 0);
    await executeRouter.executeDecreaseMarketOrders(orderId.add(1));

    console.log(`order after execute: ${await tradingRouter.decreaseMarketOrders(orderId)}`);
  }

  let position = await tradingVault.getPosition(user.address, pairIndex, isLong);

  console.log(`position: ${position}`);
  console.log(`position collateral: ${formatBalance(position.collateral)} amount: ${formatBalance(position.positionAmount)}`);

  console.log(`eth balance: ${formatBalance(await eth.balanceOf(tradingVault.address))}`,
              `usdt balance: ${formatBalance(await usdt.balanceOf(tradingVault.address))}`);

  let vault = await pairVault.getVault(pairIndex);
  console.log(`eth totalAmount: ${formatBalance(vault.indexTotalAmount)} indexReservedAmount ${formatBalance(vault.indexReservedAmount)} `);
  console.log(`usdt totalAmount: ${formatBalance(vault.stableTotalAmount)} stableReservedAmount ${formatBalance(vault.stableReservedAmount)} `);

  return orderId;
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
