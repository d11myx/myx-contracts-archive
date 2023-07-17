const { deployContract, contractAt } = require("../utils/helpers");
const { bigNumberify, expandDecimals, reduceDecimals } = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
  console.log("\n ADL test")
  const [user0, user1, user2, user3] = await hre.ethers.getSigners()

  console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

  let eth = await contractAt("WETH", await getConfig("Token-ETH"))
  let usdt = await contractAt("Token", await getConfig("Token-USDT"))
  // await usdt.mint(user0.address, expandDecimals(100, 18))
  await vaultPriceFeed.setPrice(eth.address, expandDecimals(100, 30));

  await usdt.approve(tradingRouter.address, expandDecimals(10000, 30));

  // increase long
  console.log("\n increase long")
  await executeOrder(true, user0, true, expandDecimals(600, 18), expandDecimals(60, 18));

  // increase short
  console.log("\n increase short")
  await executeOrder(true, user0, false, expandDecimals(600, 18), expandDecimals(60, 18));

  // increase long
  console.log("\n increase long")
  await executeOrder(true, user0, true, expandDecimals(600, 18), expandDecimals(60, 18));

  // decrease short
  console.log("\n decrease short")
  let orderId = await executeOrder(false, user0, false, 0, expandDecimals(60, 18));

  // ADL
  console.log("\n execute ADL")
  let pairIndex = 1;
  let positionKey = await tradingVault.getPositionKey(user0.address, pairIndex, true);
  let position = await tradingVault.getPosition(user0.address, pairIndex, false);
  console.log(`position before ADL: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)
  console.log(`position collateral: ${reduceDecimals(position.collateral, 18)} amount: ${reduceDecimals(position.positionAmount, 18)}`);
  await executeRouter.executeADLAndDecreaseOrder([positionKey], [expandDecimals(60, 18)], orderId, 0);
  console.log(`position after ADL: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)
  console.log(`order after execute: ${await tradingRouter.decreaseMarketOrders(orderId)}`);

  console.log(`position after execute: ${await tradingVault.getPosition(user0.address, pairIndex, true)}`)

  console.log(`eth balance: ${reduceDecimals(await eth.balanceOf(tradingVault.address), 18)}`,
              `usdt balance: ${reduceDecimals(await usdt.balanceOf(tradingVault.address), 18)}`);

  let vault = await pairVault.getVault(pairIndex);
  console.log(`eth totalAmount: ${reduceDecimals(vault.indexTotalAmount, 18)} indexReservedAmount ${reduceDecimals(vault.indexReservedAmount, 18)} `);
  console.log(`usdt totalAmount: ${reduceDecimals(vault.stableTotalAmount, 18)} stableReservedAmount ${reduceDecimals(vault.stableReservedAmount, 18)} `);

}

async function executeOrder(isIncrease, user, isLong, collateral, sizeAmount) {
  let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
  let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
  let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
  let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
  let vaultPriceFeed = await contractAt("VaultPriceFeedTest", await getConfig("VaultPriceFeedTest"));

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
      openPrice: expandDecimals(100, 30),
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
    await executeRouter.executeIncreaseOrder(orderId, 0);

    console.log(`order after execute: ${await tradingRouter.increaseMarketOrders(orderId)}`);
  } else {
    orderId = await tradingRouter.decreaseMarketOrdersIndex();
    let request = {
      account: user.address,
      pairIndex: pairIndex,
      tradeType: 0,
      triggerPrice: expandDecimals(100, 30),
      sizeAmount: sizeAmount,
      isLong: isLong
    };
    await tradingRouter.createDecreaseOrder(request)

    console.log(`order: ${await tradingRouter.decreaseMarketOrders(orderId)}`)

    // execute
    await executeRouter.executeDecreaseOrder(orderId, 0);

    console.log(`order after execute: ${await tradingRouter.decreaseMarketOrders(orderId)}`);
  }

  let position = await tradingVault.getPosition(user.address, pairIndex, isLong);

  console.log(`position: ${position}`);
  console.log(`position collateral: ${reduceDecimals(position.collateral, 18)} amount: ${reduceDecimals(position.positionAmount, 18)}`);

  console.log(`eth balance: ${reduceDecimals(await eth.balanceOf(tradingVault.address), 18)}`,
              `usdt balance: ${reduceDecimals(await usdt.balanceOf(tradingVault.address), 18)}`);

  let vault = await pairVault.getVault(pairIndex);
  console.log(`eth totalAmount: ${reduceDecimals(vault.indexTotalAmount, 18)} indexReservedAmount ${reduceDecimals(vault.indexReservedAmount, 18)} `);
  console.log(`usdt totalAmount: ${reduceDecimals(vault.stableTotalAmount, 18)} stableReservedAmount ${reduceDecimals(vault.stableReservedAmount, 18)} `);

  return orderId;
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
