const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {getStakingPool, getToken, getRaMYX, getStMYX} = require("../../helpers");

async function main() {
    console.log("\n stakeRaMYX")

    const [trader] = await hre.ethers.getSigners()

    let stakingPool = await getStakingPool();

    let usdt = await getToken();
    let raMYX = await getRaMYX();
    let stMYX = await getStMYX();

    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(trader.address))}`);
    let stakeAmount = expandDecimals(1000, 18);
    await raMYX.connect(trader).approve(stakingPool.address, stakeAmount);
    await stakingPool.connect(trader).stake(raMYX.address, stakeAmount);
    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(trader.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(trader.address))}`);

    console.log(`userStaked: ${formatBalance(await stakingPool.userStaked(raMYX.address, trader.address))}`);
    await stakingPool.connect(trader).unstake(raMYX.address, stakeAmount.div(2));
    console.log(`raMYXBalance: ${formatBalance(await raMYX.balanceOf(trader.address))} stMYXBalance: ${formatBalance(await stMYX.balanceOf(trader.address))}`);

    await stakingPool.connect(trader).claimReward();
    console.log(`usdt Balance: ${formatBalance(await usdt.balanceOf(trader.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
