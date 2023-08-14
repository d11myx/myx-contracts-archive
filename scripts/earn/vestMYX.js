const {deployContract, contractAt, sleep, syncBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n releaseMYX")

    const signers = await hre.ethers.getSigners()

    let myx = await contractAt("MYX", await getConfig("MYX"));
    let vester = await contractAt("Vester", await getConfig("Vester"));

    await syncBlockTime();
    console.log('init release')
    await queryReleaseToken(vester);
    await vester.releaseToken(2);
    await vester.releaseToken(3);
    await vester.releaseToken(4);
    await vester.releaseToken(5);
    await vester.releaseToken(6);
    await queryTokenBalance(signers, myx);

    let month = 30*24*60*60*1000;
    let minute = 360*1000;
    console.log('after 6 month release')
    await queryReleaseToken(vester);
    await increaseBlockTime(6*month + 30*minute);
    await vester.releaseToken(1);
    await vester.releaseToken(4);
    await vester.releaseToken(5);
    await queryTokenBalance(signers, myx);

    console.log('after 6 month release')
    await queryReleaseToken(vester);
    await increaseBlockTime(6*month + 30*minute);
    await vester.releaseToken(0);
    await vester.releaseToken(4);
    await vester.releaseToken(5);
    await queryTokenBalance(signers, myx);

    console.log('after claim release')
    await queryReleaseToken(vester);
    await syncBlockTime();
}

async function queryReleaseToken(tokenVester) {
    console.log();
    console.log(`TEAM_ADVISOR releaseToken ${formatBalance(await tokenVester.getReleaseAmount(0))}`);
    console.log(`PRIVATE_PLACEMENT releaseToken ${formatBalance(await tokenVester.getReleaseAmount(1))}`);
    console.log(`COMMUNITY releaseToken ${formatBalance(await tokenVester.getReleaseAmount(2))}`);
    console.log(`INITIAL_LIQUIDITY releaseToken ${formatBalance(await tokenVester.getReleaseAmount(3))}`);
    console.log(`MARKET_OPERATION releaseToken ${formatBalance(await tokenVester.getReleaseAmount(4))}`);
    console.log(`ECO_KEEPER releaseToken ${formatBalance(await tokenVester.getReleaseAmount(5))}`);
    console.log(`DEVELOPMENT_RESERVE releaseToken ${formatBalance(await tokenVester.getReleaseAmount(6))}`);
}

async function queryTokenBalance(signers, myx) {
    let teamAndAdvisor = signers[20];
    let privatePlacement = signers[21];
    let community = signers[22];
    let initLiquidity = signers[23];
    let marketOperation = signers[24];
    let ecoKeeper = signers[25];
    let developmentReserve = signers[26];

    console.log(`myx balance of TEAM_ADVISOR ${teamAndAdvisor.address} : ${formatBalance(await myx.balanceOf(teamAndAdvisor.address))}`);
    console.log(`myx balance of PRIVATE_PLACEMENT ${privatePlacement.address} : ${formatBalance(await myx.balanceOf(privatePlacement.address))}`);
    console.log(`myx balance of COMMUNITY ${community.address} : ${formatBalance(await myx.balanceOf(community.address))}`);
    console.log(`myx balance of INITIAL_LIQUIDITY ${initLiquidity.address} : ${formatBalance(await myx.balanceOf(initLiquidity.address))}`);
    console.log(`myx balance of MARKET_OPERATION ${marketOperation.address} : ${formatBalance(await myx.balanceOf(marketOperation.address))}`);
    console.log(`myx balance of ECO_KEEPER ${ecoKeeper.address} : ${formatBalance(await myx.balanceOf(ecoKeeper.address))}`);
    console.log(`myx balance of DEVELOPMENT_RESERVE ${developmentReserve.address} : ${formatBalance(await myx.balanceOf(developmentReserve.address))}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
