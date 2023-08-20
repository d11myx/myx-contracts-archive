const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {getRaMYX, getMYX, getConvertor} = require("../../helpers");
const {increaseBlockTime, syncBlockTime} = require("../utils/helpers");

async function main() {
    console.log("\n convertRaMYX")

    const [trader, communityPool] = await hre.ethers.getSigners()

    let myx = await getMYX();
    let raMYX = await getRaMYX();
    let convertor = await getConvertor();

    const day = 24*60*60*1000;

    // transfer myx to converter
    let communityBalance = await myx.balanceOf(communityPool.address);
    console.log(`myx balance of communityPool : ${formatBalance(communityBalance)}`);
    await myx.connect(communityPool).transfer(convertor.address, communityBalance);

    console.log("\n convert for 0 day");
    await raMYX.connect(trader).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(trader).convert(expandDecimals(100, 18), 0);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(trader.address))} myx balance: ${formatBalance(await myx.balanceOf(trader.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n convert for 14 day");
    await raMYX.connect(trader).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(trader).convert(expandDecimals(100, 18), 14);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(trader.address))} myx balance: ${formatBalance(await myx.balanceOf(trader.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n convert for 30 day");
    await increaseBlockTime(10 * day);
    await raMYX.connect(trader).approve(convertor.address, expandDecimals(100, 18));
    await convertor.connect(trader).convert(expandDecimals(100, 18), 30);

    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(trader.address))} myx balance: ${formatBalance(await myx.balanceOf(trader.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n claim");
    await increaseBlockTime(10 * day);
    await convertor.connect(trader).claim();
    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(trader.address))} myx balance: ${formatBalance(await myx.balanceOf(trader.address))}`);
    console.log(`raMYX balance of convertor: ${formatBalance(await raMYX.balanceOf(convertor.address))} myx balance: ${formatBalance(await myx.balanceOf(convertor.address))}`);
    console.log(`myx balance of communityPool : ${formatBalance(await myx.balanceOf(communityPool.address))}`);

    console.log("\n claim");
    await increaseBlockTime(21 * day);
    await convertor.connect(trader).claim();
    console.log(`raMYX balance of user: ${formatBalance(await raMYX.balanceOf(trader.address))} myx balance: ${formatBalance(await myx.balanceOf(trader.address))}`);
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
