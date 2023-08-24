const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {getLPStakingPool, getPool} = require("../../helpers");

async function main() {
    console.log("\n stakeMLP")

    const [trader] = await hre.ethers.getSigners()
    let lpStakingPool = await getLPStakingPool();

    let pool = await getPool();

    let pairIndex = 0;


    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);
    let stakeAmount = expandDecimals(100, 18);
    await pairToken.connect(trader).approve(lpStakingPool.address, stakeAmount);
    await lpStakingPool.connect(trader).stake(pairIndex, stakeAmount);
    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);

    console.log(`userStaked: ${formatBalance(await lpStakingPool.userStaked(pairIndex, trader.address))}`);
    await lpStakingPool.connect(trader).unstake(pairIndex, stakeAmount);
    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);


    pairIndex = 1;


    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);
    stakeAmount = expandDecimals(100, 18);
    await pairToken.connect(trader).approve(lpStakingPool.address, stakeAmount);
    await lpStakingPool.connect(trader).stake(pairIndex, stakeAmount);
    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);

    console.log(`userStaked: ${formatBalance(await lpStakingPool.userStaked(pairIndex, trader.address))}`);
    await lpStakingPool.connect(trader).unstake(pairIndex, stakeAmount);
    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(trader.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
