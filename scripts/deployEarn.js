const {deployContract, deployUpgradeableContract, contractAt} = require("./utils/helpers");
const {expandDecimals, formatBalance} = require("./utils/utilities");
const hre = require("hardhat");
const {mintWETH, getConfig} = require("./utils/utils");

async function main() {

    const signers = await hre.ethers.getSigners()

    let usdt = await contractAt('Token', await getConfig('Token-USDT'));
    let pairInfo = await contractAt("PairInfo", await getConfig("PairInfo"));

    let myx = await deployContract("MYX", [])
    let raMYX = await deployContract("RaMYX", [])
    let stMYX = await deployContract("StMYX", [])

    let teamAndAdvisor = signers[20];
    let privatePlacement = signers[21];
    let community = signers[22];
    let initLiquidity = signers[23];
    let marketOperation = signers[24];
    let ecoKeeper = signers[25];
    let developmentReserve = signers[26];

    // MYXVester
    let args = [
        myx.address,
        teamAndAdvisor.address,
        privatePlacement.address,
        community.address,
        initLiquidity.address,
        marketOperation.address,
        ecoKeeper.address,
        developmentReserve.address,
    ]
    let vester = await deployContract("Vester", args);

    await myx.initialize(vester.address, "1000000000000000000000000000");
    console.log(`myx balance of ${vester.address} : ${formatBalance(await myx.balanceOf(vester.address))}`);

    // StakingPool
    let myxStakingPool = await deployContract("StakingPool", [myx.address, stMYX.address], "MYX");
    let raMYXStakingPool = await deployContract("StakingPool", [raMYX.address, stMYX.address], "RaMYX");
    let mlpStakingPool = await deployContract("MLPStakingPool", [pairInfo.address]);

    // convertor
    let convertor = await deployContract("Convertor", [raMYX.address, myx.address]);

    // distributor
    let feeDistributor = await deployContract("Distributor", [usdt.address], "Fee");
    let raMYXDistributor = await deployContract("Distributor", [raMYX.address], "RaMYX");

    await convertor.setCommunityPool(community.address);
    await raMYXDistributor.setStakingPool(raMYXStakingPool.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
