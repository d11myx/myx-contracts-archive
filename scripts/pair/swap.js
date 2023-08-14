const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals, formatBalance, reduceDecimals, getBlockTime} = require("../utils/utilities");
const {getConfig, mintETH} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
    console.log("\n addLiquidity")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));
    let pairVault = await contractAt("PairVault", await getConfig("PairVault"));
    let pairLiquidity = await contractAt("PairLiquidity", await getConfig("PairLiquidity"));

    let eth = await contractAt("WETH", await getConfig("Token-ETH"))
    let btc = await contractAt("Token", await getConfig("Token-BTC"))
    let usdt = await contractAt("Token", await getConfig("Token-USDT"))

    console.log(`pairInfo: ${pairInfo.address}, pairVault: ${pairVault.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

    // swap usdt to eth
    let usdtInAmount = expandDecimals(5000000, 18);
    await usdt.mint(user0.address, usdtInAmount)
    await usdt.approve(pairLiquidity.address, usdtInAmount);
    await pairLiquidity.swap(pairIndex, true, usdtInAmount, 0);
    console.log(`balance eth: ${formatBalance(await eth.balanceOf(pairVault.address))}, usdt: ${formatBalance(await usdt.balanceOf(pairVault.address))}`);

    await mintETH(user0.address, 10000)

    let ethInAmount = expandDecimals(10000, 18);
    await pairLiquidity.swapInEth(pairIndex, ethInAmount, 0);
    console.log(`balance eth: ${formatBalance(await eth.balanceOf(pairVault.address))}, usdt: ${formatBalance(await usdt.balanceOf(pairVault.address))}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
