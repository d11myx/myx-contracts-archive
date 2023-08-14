const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n stakeRaMYX")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
    let raMYXStakingPool = await contractAt("StakingPool", await getConfig("StakingPool:RaMYX"));

    let raMYX = await contractAt("RaMYX", await getConfig("RaMYX"));
    let stMYX = await contractAt("StMYX", await getConfig("StMYX"));

    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(user1.address))}`);
    let stakeAmount = expandDecimals(1000, 18);
    await raMYX.connect(user1).approve(raMYXStakingPool.address, stakeAmount);
    await raMYXStakingPool.connect(user1).stake(stakeAmount);
    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(user1.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(user1.address))}`);

    console.log(`userStaked: ${formatBalance(await raMYXStakingPool.userStaked(user1.address))}`);
    await raMYXStakingPool.connect(user1).unstake(stakeAmount);
    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(user1.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(user1.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
