const {deployContract, contractAt, toChainLinkPrice, queryPosition} = require("../utils/helpers");
const {expandDecimals, formatBalance, getBlockTime} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
    const [user0, user1, user2, user3, user4, user5, user6, user7, user8, user9] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
    let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
    let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
    let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
    let btcPriceFeed = await contractAt("MockPriceFeed", await getConfig("MockPriceFeed-BTC"));
    let fastPriceFeed = await contractAt("FastPriceFeed", await getConfig("FastPriceFeed"))

    // create
    let btc = await contractAt("Token", await getConfig("Token-BTC"))
    let usdt = await contractAt("Token", await getConfig("Token-USDT"))
    // await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000))
    // await fastPriceFeed.connect(user1).setPrices([await getConfig("Token-BTC")],
    //     [expandDecimals(30000, 30)],
    //     await getBlockTime(await hre.ethers.provider) + 100)

    let user = user9;
    let pairIndex = 0;
    let isLong = true;

    console.log(`position: ${await tradingVault.getPosition(user.address, pairIndex, isLong)}`)

    let orderId = await tradingRouter.decreaseLimitOrdersIndex();
    // let orderId = 0;
    let request = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: 1,
        collateral: expandDecimals(2000, 18),
        triggerPrice: expandDecimals(40000, 30),
        sizeAmount: expandDecimals(1, 18),
        isLong: isLong
    };
    await tradingRouter.connect(user).createDecreaseOrder(request)

    console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`)
    console.log(`balance of usdt: ${formatBalance(await usdt.balanceOf(tradingRouter.address))}`);

    // execute
    await executeRouter.executeDecreaseOrder(orderId, 1);
    // await executeRouter.executeDecreaseLimitOrders([orderId]);

    console.log(`order: ${await tradingRouter.decreaseLimitOrders(orderId)}`);

    await queryPosition(user, pairIndex, isLong);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })