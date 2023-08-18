const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {getToken, getStMYX, getMYX, getStakingPool} = require("../../helpers");

async function main() {
    console.log("\n stakeMYX")

    const [trader] = await hre.ethers.getSigners()

    let stakingPool = await getStakingPool();

    const usdt = await getToken()
    let myx = await getMYX();
    let stMYX = await getStMYX();

    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(trader.address))}`);
    let stakeAmount = expandDecimals(200, 18);
    await myx.connect(trader).approve(stakingPool.address, stakeAmount);
    await stakingPool.connect(trader).stake(myx.address, stakeAmount);
    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(trader.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(trader.address))}`);

    console.log(`userStaked: ${formatBalance(await stakingPool.userStaked(myx.address, trader.address))}`);
    await stakingPool.connect(trader).unstake(myx.address, stakeAmount.div(2));
    console.log(`myxBalance: ${formatBalance(await myx.balanceOf(trader.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(trader.address))}`);

    await stakingPool.connect(trader).claimReward();
    console.log(`usdt Balance: ${formatBalance(await usdt.balanceOf(trader.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
