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

    let btcAmount = expandDecimals(10000, 18);
    let usdtAmount = expandDecimals(300000000, 18);
    // mint token
    await btc.mint(user0.address, btcAmount)
    await usdt.mint(user0.address, usdtAmount)

    // add liquidity
    await btc.approve(pairLiquidity.address, btcAmount);
    await usdt.approve(pairLiquidity.address, usdtAmount);
    let pairIndex = await pairInfo.pairIndexes(btc.address, usdt.address);
    console.log(`btc-usdt lpFairPrice, ${reduceDecimals(await pairLiquidity.lpFairPrice(pairIndex), 30)}`);
    console.log(`calculate mint lp amount: ${await pairLiquidity.getMintLpAmount(pairIndex, btcAmount, usdtAmount)}`);
    console.log(`calculate deposit amount: ${await pairLiquidity.getDepositAmount(pairIndex, usdtAmount.mul(2))}`);
    await pairLiquidity.addLiquidity(pairIndex, btcAmount, usdtAmount);

    let vault = await pairVault.getVault(pairIndex);
    console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log();

    let pairToken = await contractAt("PairToken", (await pairInfo.pairs(pairIndex)).pairToken);
    let lpAmount = await pairToken.balanceOf(user0.address);
    console.log(`lp supply: ${formatBalance(await pairToken.totalSupply())}, lp amount of user: ${formatBalance(lpAmount)}`);
    console.log(`deposit fee btc: ${formatBalance(await btc.balanceOf(user1.address))}, usdt: ${formatBalance(await usdt.balanceOf(user1.address))}`);
    console.log(`slip fee btc: ${formatBalance(await btc.balanceOf(user2.address))}, usdt: ${formatBalance(await usdt.balanceOf(user2.address))}`);
    console.log();

    // remove liquidity
    console.log(`btc-usdt lpFairPrice, ${reduceDecimals(await pairLiquidity.lpFairPrice(pairIndex), 30)}`);
    console.log(`calculate mint lp amount: ${await pairLiquidity.getMintLpAmount(pairIndex, btcAmount.div(10), 0)}`);
    console.log(`calculate deposit amount: ${await pairLiquidity.getDepositAmount(pairIndex, usdtAmount.div(10))}`);
    console.log(`calculate received amount: ${await pairLiquidity.getReceivedAmount(pairIndex, lpAmount.div(10))}`);

    await pairLiquidity.removeLiquidity(pairIndex, lpAmount.div(10));
    lpAmount = await pairToken.balanceOf(user0.address);
    console.log(`lp supply: ${formatBalance(await pairToken.totalSupply())}, lp amount of user: ${formatBalance(lpAmount)}`);

    vault = await pairVault.getVault(pairIndex);
    console.log(`total btc: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log();

    // add liquidity for eth
    let ethAmount = expandDecimals(10000, 18);
    usdtAmount = expandDecimals(20000000, 18);

    await mintETH(user0.address, 10000)
    await usdt.mint(user0.address, usdtAmount)

    // await eth.approve(pairLiquidity.address, ethAmount);
    await usdt.approve(pairLiquidity.address, usdtAmount);
    pairIndex = await pairInfo.pairIndexes(eth.address, usdt.address);
    console.log(`eth-usdt lpFairPrice, ${reduceDecimals(await pairLiquidity.lpFairPrice(pairIndex), 30)}`);
    console.log(`calculate mint lp amount: ${await pairLiquidity.getMintLpAmount(pairIndex, ethAmount, usdtAmount)}`);
    console.log(`calculate deposit amount: ${await pairLiquidity.getDepositAmount(pairIndex, usdtAmount.mul(2))}`);
    await pairLiquidity.addLiquidityETH(pairIndex, usdtAmount, {value: ethAmount});

    vault = await pairVault.getVault(pairIndex);
    console.log(`total eth: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log(`balance eth: ${formatBalance(await eth.balanceOf(pairVault.address))} balance usdt: ${formatBalance(await usdt.balanceOf(pairVault.address))}`);
    console.log();

    // remove
    pairToken = await contractAt("PairToken", (await pairInfo.pairs(pairIndex)).pairToken);
    lpAmount = await pairToken.balanceOf(user0.address);
    console.log(`lp supply: ${formatBalance(await pairToken.totalSupply())}, lp amount of user: ${formatBalance(lpAmount)}`);

    await pairLiquidity.removeLiquidity(pairIndex, lpAmount.div(10));

    lpAmount = await pairToken.balanceOf(user0.address);
    console.log(`lp supply: ${formatBalance(await pairToken.totalSupply())}, lp amount of user: ${formatBalance(lpAmount)}`);
    vault = await pairVault.getVault(pairIndex);
    console.log(`total eth: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log(`balance eth: ${formatBalance(await eth.balanceOf(pairVault.address))} balance usdt: ${formatBalance(await usdt.balanceOf(pairVault.address))}`);
    console.log();

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
