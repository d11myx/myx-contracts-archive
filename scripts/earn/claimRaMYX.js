const {expandDecimals, formatBalance} = require("../utils/utilities");
const hre = require("hardhat");
const {createMerkleTree, getLeaf, MerkleTree} = require("../utils/merkleTreeHelper")
const {getRaMYX, getRewardDistributor, getStakingPool} = require("../../helpers");

async function main() {
    console.log("\n claimRaMYX")

    const [user0, user1, user2, trader] = await hre.ethers.getSigners()

    let raMYX = await getRaMYX();
    let distributor = await getRewardDistributor();

    await distributor.setHandler(user0.address, true);

    let node0 = ethers.utils.solidityPack(["address", "uint256"], [user0.address, expandDecimals(1000, 18)]);
    let node1 = ethers.utils.solidityPack(["address", "uint256"], [user1.address, expandDecimals(2000, 18)]);
    let node2 = ethers.utils.solidityPack(["address", "uint256"], [user2.address, expandDecimals(3000, 18)]);
    let node3 = ethers.utils.solidityPack(["address", "uint256"], [trader.address, expandDecimals(4000, 18)]);

    const elements = [node0, node1, node2, node3];
    console.log(`elements: ${elements}`);

    const merkleTree = createMerkleTree(elements);
    console.log("merkleTree:", merkleTree.toString());

    // await distributor.updateRoot(merkleTree.getRoot(), 0);
    let round = await distributor.round();
    console.log(`round: ${round} root: ${await distributor.merkleRoots(round)} balance: ${await raMYX.balanceOf(distributor.address)}`);

    // claim
    const proof = merkleTree.getHexProof(getLeaf(node3));
    console.log(`proof: ${proof}`);

    console.log(`user can claim: ${await distributor.connect(trader).canClaim(expandDecimals(4000, 18), proof)}`);
    await distributor.connect(trader).claim(expandDecimals(4000, 18), proof);
    console.log(`balance of user: ${await raMYX.balanceOf(trader.address)}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
