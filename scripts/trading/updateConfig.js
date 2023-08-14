const {deployContract, deployUpgradeableContract, toChainLinkPrice} = require("../utils/helpers");
const {expandDecimals, getBlockTime, reduceDecimals} = require("../utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig, repeatString} = require("../utils/utils");
const {contractAt} = require("../utils/helpers");
const {BigNumber} = require("ethers");

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
    console.log("\n trading updateConfig")
    const signers = await hre.ethers.getSigners()

    let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
    let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
    let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
    let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));

    let feeDistributor = await contractAt("Distributor", await getConfig("Distributor:Fee"));

    await executeRouter.setMaxTimeDelay(60);

    await tradingVault.setTradingFeeReceiver(feeDistributor.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
