const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n stakeMYX")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
    let myxStakingPool = await contractAt("StakingPool", await getConfig("StakingPool:MYX"));

    let myx = await contractAt("MYX", await getConfig("MYX"));
    let stMYX = await contractAt("StMYX", await getConfig("StMYX"));

    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(user1.address))}`);
    let stakeAmount = expandDecimals(100, 18);
    await myx.connect(user1).approve(myxStakingPool.address, stakeAmount);
    await myxStakingPool.connect(user1).stake(stakeAmount);
    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(user1.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(user1.address))}`);

    console.log(`userStaked: ${formatBalance(await myxStakingPool.userStaked(user1.address))}`);
    await myxStakingPool.connect(user1).unstake(stakeAmount);
    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(user1.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(user1.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
