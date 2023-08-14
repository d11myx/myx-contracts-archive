const {deployContract, contractAt, toChainLinkPrice, queryPosition} = require("../utils/helpers");
const {expandDecimals, formatBalance, getBlockTime, reduceDecimals} = require("../utils/utilities");
const {mintWETH, getConfig} = require("../utils/utils");
const hre = require("hardhat");

async function main() {
    const [user0, user1, user2, user3, user4, user5, user6, user7, user8, user9] = await hre.ethers.getSigners()
    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    await queryPosition(user9, 0, true);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })

