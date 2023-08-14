const {deployContract, contractAt, sleep} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");

async function main() {
    console.log("\n queryReleaseMYX")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)
    let vester = await contractAt("Vester", await getConfig("Vester"));

    console.log();
    console.log(`TEAM_ADVISOR releaseToken ${formatBalance(await vester.getReleaseAmount(0))}`);
    console.log(`PRIVATE_PLACEMENT releaseToken ${formatBalance(await vester.getReleaseAmount(1))}`);
    console.log(`COMMUNITY releaseToken ${formatBalance(await vester.getReleaseAmount(2))}`);
    console.log(`INITIAL_LIQUIDITY releaseToken ${formatBalance(await vester.getReleaseAmount(3))}`);
    console.log(`MARKET_OPERATION releaseToken ${formatBalance(await vester.getReleaseAmount(4))}`);
    console.log(`ECO_KEEPER releaseToken ${formatBalance(await vester.getReleaseAmount(5))}`);
    console.log(`DEVELOPMENT_RESERVE releaseToken ${formatBalance(await vester.getReleaseAmount(6))}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
