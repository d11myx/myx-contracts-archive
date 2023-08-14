const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime, syncBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig, mintETH} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n convertRaMYX")

    const signers = await hre.ethers.getSigners()

    let myx = await contractAt("MYX", await getConfig("MYX"));
    let raMYX = await contractAt("RaMYX", await getConfig("RaMYX"));
    let convertor = await contractAt("Convertor", await getConfig("Convertor"));

    let user = signers[1];
    let communityPool = signers[22];
    const day = 24*60*60*1000;

    // transfer myx to converter
    let communityBalance = await myx.balanceOf(communityPool.address);
    console.log(`myx balance of communityPool : ${formatBalance(communityBalance)}`);
    await mintETH(communityPool.address, 1);
    await myx.connect(communityPool).transfer(convertor.address, communityBalance);

    console.log("\n convert for 0 day");
    await raMYX.connect(user).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(user).convert(expandDecimals(100, 18), 0);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(user.address))} myx balance: ${formatBalance(await myx.balanceOf(user.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n convert for 14 day");
    await raMYX.connect(user).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(user).convert(expandDecimals(100, 18), 14);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(user.address))} myx balance: ${formatBalance(await myx.balanceOf(user.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n convert for 30 day");
    await increaseBlockTime(10 * day);
    await raMYX.connect(user).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(user).convert(expandDecimals(100, 18), 30);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(user.address))} myx balance: ${formatBalance(await myx.balanceOf(user.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n claim");
    await increaseBlockTime(10 * day);
    await convertor.connect(user).claim();
    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(user.address))} myx balance: ${formatBalance(await myx.balanceOf(user.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n claim");
    await increaseBlockTime(21 * day);
    await convertor.connect(user).claim();
    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(user.address))} myx balance: ${formatBalance(await myx.balanceOf(user.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);
    await syncBlockTime();

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
