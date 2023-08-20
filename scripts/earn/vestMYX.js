const {syncBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {getMYX, getVester} = require("../../helpers");

async function main() {
    console.log("\n releaseMYX")

    const [teamAndAdvisor, privatePlacement, community, initLiquidity,
        marketOperation, ecoKeeper, developmentReserve] = await hre.ethers.getSigners()
    const signers = {teamAndAdvisor, privatePlacement, community, initLiquidity,
        marketOperation, ecoKeeper, developmentReserve}

    let myx = await getMYX();
    let vester = await getVester();

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
    let teamAndAdvisor = signers.teamAndAdvisor;
    let privatePlacement = signers.privatePlacement;
    let community = signers.community;
    let initLiquidity = signers.initLiquidity;
    let marketOperation = signers.marketOperation;
    let ecoKeeper = signers.ecoKeeper;
    let developmentReserve = signers.developmentReserve;

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
