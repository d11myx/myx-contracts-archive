const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {createMerkleTree, getLeaf, MerkleTree} = require("../utils/merkleTreeHelper")
const {getToken, getFeeDistributor} = require("../../helpers");

async function main() {
    console.log("\n claimFee")

    const [user0, user1, user2, trader] = await hre.ethers.getSigners()

    let feeDistributor = await getFeeDistributor();
    let usdt = await getToken()

    console.log(`usdt balance: ${await usdt.balanceOf(feeDistributor.address)}`);

    await feeDistributor.setHandler(trader.address, true);

    let node0 = ethers.utils.solidityPack(["address", "uint256"], [user0.address, expandDecimals(100, 18)]);
    let node1 = ethers.utils.solidityPack(["address", "uint256"], [user1.address, expandDecimals(200, 18)]);
    let node2 = ethers.utils.solidityPack(["address", "uint256"], [user2.address, expandDecimals(300, 18)]);
    let node3 = ethers.utils.solidityPack(["address", "uint256"], [trader.address, expandDecimals(400, 18)]);

    const elements = [node0, node1, node2, node3];
    console.log(`elements: ${elements}`);

    const merkleTree = createMerkleTree(elements);
    console.log("merkleTree:", merkleTree.toString());

    await feeDistributor.updateRoot(merkleTree.getRoot(), 0);
    let round = await feeDistributor.round();
    console.log(`round: ${round} root: ${await feeDistributor.merkleRoots(round)} balance: ${await usdt.balanceOf(feeDistributor.address)}`);

    const proof = merkleTree.getHexProof(getLeaf(node3));
    console.log(`proof: ${proof}`);

    console.log(`user can claim: ${await feeDistributor.connect(trader).canClaim(expandDecimals(400, 18), proof)}`);
    await feeDistributor.connect(trader).claim(expandDecimals(400, 18), proof);
    console.log(`balance: ${await usdt.balanceOf(feeDistributor.address)}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
