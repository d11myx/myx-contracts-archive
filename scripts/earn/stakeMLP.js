const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n stakeMLP")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
    let mlpStakingPool = await contractAt("MLPStakingPool", await getConfig("MLPStakingPool"));

    let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));

    let pairIndex = 0;
    let pairToken = await contractAt("PairToken", (await pairInfo.pairs(pairIndex)).pairToken);

    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);
    let stakeAmount = expandDecimals(100, 18);
    await pairToken.approve(mlpStakingPool.address, stakeAmount);
    await mlpStakingPool.stake(pairIndex, stakeAmount);
    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);

    console.log(`userStaked: ${formatBalance(await mlpStakingPool.userStaked(pairIndex, user0.address))}`);
    await mlpStakingPool.unstake(pairIndex, stakeAmount);
    console.log(`btc mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);


    pairIndex = 1;
    pairToken = await contractAt("PairToken", (await pairInfo.pairs(pairIndex)).pairToken);

    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);
    stakeAmount = expandDecimals(100, 18);
    await pairToken.approve(mlpStakingPool.address, stakeAmount);
    await mlpStakingPool.stake(pairIndex, stakeAmount);
    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);

    console.log(`userStaked: ${formatBalance(await mlpStakingPool.userStaked(pairIndex, user0.address))}`);
    await mlpStakingPool.unstake(pairIndex, stakeAmount);
    console.log(`eth mlp Balance: ${formatBalance(await pairToken.balanceOf(user0.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
