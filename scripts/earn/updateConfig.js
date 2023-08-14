const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n earn updateConfig")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
    let convertor = await contractAt("Convertor", await getConfig("Convertor"));
    let myxStakingPool = await contractAt("StakingPool", await getConfig("StakingPool:MYX"));
    let raMYXStakingPool = await contractAt("StakingPool", await getConfig("StakingPool:RaMYX"));
    let mlpStakingPool = await contractAt("MLPStakingPool", await getConfig("MLPStakingPool"));

    let raMYX = await contractAt("RaMYX", await getConfig("RaMYX"));
    let stMYX = await contractAt("StMYX", await getConfig("StMYX"));

    // StakingPool
    await myxStakingPool.setMaxStakeAmount(expandDecimals(1_000_000, 18));

    await raMYXStakingPool.setMaxStakeAmount(expandDecimals(1_000_000, 18));

    await mlpStakingPool.setMaxStakeAmount(0, expandDecimals(1_000_000, 18));
    await mlpStakingPool.setMaxStakeAmount(1, expandDecimals(1_000_000, 18));

    // distributor
    let feeDistributor = await contractAt("Distributor", await getConfig("Distributor:Fee"));
    let raMYXDistributor = await contractAt("Distributor", await getConfig("Distributor:RaMYX"));

    await feeDistributor.setHandler(user0.address, true);
    await raMYXDistributor.setHandler(user0.address, true);

    await raMYX.setPrivateTransferMode(true);
    await raMYX.setMiner(raMYXDistributor.address, true);
    await raMYX.setMiner(convertor.address, true);
    await raMYX.setHandler(raMYXStakingPool.address, true);
    await raMYX.setHandler(convertor.address, true);

    await stMYX.setPrivateTransferMode(true);
    await stMYX.setMiner(myxStakingPool.address, true);
    await stMYX.setMiner(raMYXStakingPool.address, true);
    await stMYX.setHandler(myxStakingPool.address, true);
    await stMYX.setHandler(raMYXStakingPool.address, true);

    await raMYXStakingPool.setHandler(raMYXDistributor.address, true);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
