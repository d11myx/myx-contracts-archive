const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {createMerkleTree, getLeaf, MerkleTree} = require("../utils/merkleTreeHelper")

async function main() {
    console.log("\n claimRaMYX")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    let raMYX = await contractAt("RaMYX", await getConfig("RaMYX"));
    let raMYXDistributor = await contractAt("Distributor", await getConfig("Distributor:RaMYX"));
    let raMYXStakingPool = await contractAt("StakingPool", await getConfig("StakingPool:RaMYX"));

    await raMYXDistributor.setHandler(user0.address, true);

    let node0 = ethers.utils.solidityPack(["address", "uint256"], [user0.address, expandDecimals(1000, 18)]);
    let node1 = ethers.utils.solidityPack(["address", "uint256"], [user1.address, expandDecimals(2000, 18)]);
    let node2 = ethers.utils.solidityPack(["address", "uint256"], [user2.address, expandDecimals(3000, 18)]);
    let node3 = ethers.utils.solidityPack(["address", "uint256"], [user3.address, expandDecimals(4000, 18)]);

    const elements = [node0, node1, node2, node3];
    console.log(`elements: ${elements}`);

    const merkleTree = createMerkleTree(elements);
    console.log("merkleTree:", merkleTree.toString());

    await raMYXDistributor.updateRoot(merkleTree.getRoot());
    let round = await raMYXDistributor.round();
    console.log(`round: ${round} root: ${await raMYXDistributor.merkleRoots(round)} balance: ${await raMYX.balanceOf(raMYXDistributor.address)}`);

    // user0 compound
    let leaf0 = getLeaf(node0);
    const proof = merkleTree.getHexProof(leaf0);
    console.log(`proof: ${proof}`);

    console.log(`user can claim: ${await raMYXDistributor.canClaim(expandDecimals(1000, 18), proof)}`);
    await raMYXDistributor.compound(expandDecimals(1000, 18), proof);
    console.log(`balance of user0: ${await raMYX.balanceOf(user0.address)}`);

    // user1 claim
    let leaf1 = getLeaf(node1);
    const proof1 = merkleTree.getHexProof(leaf1);
    console.log(`proof: ${proof1}`);

    console.log(`user can claim: ${await raMYXDistributor.connect(user1).canClaim(expandDecimals(2000, 18), proof1)}`);
    await raMYXDistributor.connect(user1).claim(expandDecimals(2000, 18), proof1);
    console.log(`balance of user1: ${await raMYX.balanceOf(user1.address)}`);
    console.log(`userStaked: ${formatBalance(await raMYXStakingPool.userStaked(user1.address))}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
