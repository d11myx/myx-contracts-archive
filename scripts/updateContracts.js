const {deployContract, deployUpgradeableContract, updateContract} = require("./utils/helpers");
const {expandDecimals} = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");
const {contractAt} = require("./utils/helpers");

async function main() {

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));
    let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
    let pairLiquidity = await contractAt("PairLiquidity", await getConfig("PairLiquidity"));

    await updateContract("PairInfo", pairInfo.address);
    await updateContract("PairVault", pairVault.address);
    await updateContract("PairLiquidity", pairLiquidity.address);

    let tradingVault = await contractAt("TradingVault", await getConfig("TradingVault"));
    let tradingRouter = await contractAt("TradingRouter", await getConfig("TradingRouter"));
    let executeRouter = await contractAt("ExecuteRouter", await getConfig("ExecuteRouter"));
    let tradingUtils = await contractAt("TradingUtils", await getConfig("TradingUtils"));

    await updateContract("TradingVault", tradingVault.address);
    await updateContract("TradingRouter", tradingRouter.address);
    await updateContract("ExecuteRouter", executeRouter.address);
    await updateContract("TradingUtils", tradingUtils.address);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
