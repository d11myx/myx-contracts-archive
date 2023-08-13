const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n updatePair")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    let pool = await contractAt("Pool", await getConfig("Pool"));
    let pairLiquidity = await contractAt("PoolLiquidity", await getConfig("PoolLiquidity"));

    let eth = await contractAt("WETH", await getConfig("Token-ETH"))
    let btc = await contractAt("Token", await getConfig("Token-BTC"))
    let usdt = await contractAt("Token", await getConfig("Token-USDT"))

    console.log(`pairStorage: ${pool.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

    let pair = {
        indexToken: btc.address,
        stableToken: usdt.address,
        pairToken: "0x0000000000000000000000000000000000000000",
        enable: true,
        kOfSwap: expandDecimals(1, 50),
        expectIndexTokenP: 4000,
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

    // btc - usdt
    let pairIndex = await pool.pairIndexes(pair.indexToken, pair.stableToken);
    await pool.updatePair(pairIndex, pair);
    await pool.updateTradingConfig(pairIndex, tradingConfig);
    await pool.updateTradingFeeConfig(pairIndex, tradingFeeConfig);
    await pool.updateFundingFeeConfig(pairIndex, fundingFeeConfig);

    let pairToken = await contractAt("PoolToken", (await pool.pairs(pairIndex)).pairToken);
    console.log(`pair0 index: ${pairIndex} pairToken: ${pairToken.address}`);
    console.log(`pairToken owner  ${await pairToken.owner()}`)
    await pool.updatePairMiner(pairIndex, pairLiquidity.address, true);

    console.log(`pair0: ${await pool.getPair(pairIndex)},
    tradingConfig: ${await pool.getTradingConfig(pairIndex)},
    tradingFeeConfig: ${await pool.getTradingFeeConfig(pairIndex)},
    fundingFeeConfig: ${await pool.getFundingFeeConfig(pairIndex)}`);

    // eth - usdt
    pair.indexToken = eth.address;
    pairIndex = await pool.pairIndexes(pair.indexToken, pair.stableToken);
    await pool.updatePair(pairIndex, pair);
    await pool.updateTradingConfig(pairIndex, tradingConfig);
    await pool.updateTradingFeeConfig(pairIndex, tradingFeeConfig);
    await pool.updateFundingFeeConfig(pairIndex, fundingFeeConfig);

    pairToken = await contractAt("PoolToken", (await pool.pairs(pairIndex)).pairToken);
    console.log(`pair1 index: ${pairIndex} pairToken: ${pairToken.address}`);
    console.log(`pairToken owner  ${await pairToken.owner()}`)
    await pool.updatePairMiner(pairIndex, pairLiquidity.address, true);

    console.log(`pair1: ${await pool.getPair(pairIndex)},
    tradingConfig: ${await pool.getTradingConfig(pairIndex)},
    tradingFeeConfig: ${await pool.getTradingFeeConfig(pairIndex)},
    fundingFeeConfig: ${await pool.getFundingFeeConfig(pairIndex)}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
