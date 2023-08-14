const {deployContract, contractAt, sleep, myxBlockTime, increaseBlockTime} = require("../utils/helpers");
const {expandDecimals, formatBalance} = require("../utils/utilities");
const {mintWETH, getConfig, setConfig} = require("../utils/utils");
const hre = require("hardhat");
const {BigNumber} = require("ethers");
const {createMerkleTree, getLeaf, MerkleTree} = require("../utils/merkleTreeHelper")

async function main() {
    console.log("\n claimFee")

    const [user0, user1, user2, user3] = await hre.ethers.getSigners()

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`)

    const provider = ethers.provider;
    const defaultAbiCoder = ethers.utils.defaultAbiCoder;

    let feeDistributor = await contractAt("Distributor", await getConfig("Distributor:Fee"));
    let usdt = await contractAt("Token", await getConfig("Token-USDT"))
    console.log(`usdt balance: ${await usdt.balanceOf(feeDistributor.address)}`);

    await feeDistributor.setHandler(user0.address, true);

    let node0 = ethers.utils.solidityPack(["address", "uint256"], [user0.address, expandDecimals(1, 18)]);
    let node1 = ethers.utils.solidityPack(["address", "uint256"], [user1.address, expandDecimals(2, 18)]);
    let node2 = ethers.utils.solidityPack(["address", "uint256"], [user2.address, expandDecimals(3, 18)]);
    let node3 = ethers.utils.solidityPack(["address", "uint256"], [user3.address, expandDecimals(4, 18)]);

    const elements = [node0, node1, node2, node3];
    console.log(`elements: ${elements}`);

    const merkleTree = createMerkleTree(elements);
    console.log("merkleTree:", merkleTree.toString());

    await feeDistributor.updateRoot(merkleTree.getRoot());
    let round = await feeDistributor.round();
    console.log(`round: ${round} root: ${await feeDistributor.merkleRoots(round)} balance: ${await usdt.balanceOf(feeDistributor.address)}`);

    let leaf0 = getLeaf(node0);
    const proof = merkleTree.getHexProof(leaf0);
    console.log(`proof: ${proof}`);

    console.log(`user can claim: ${await feeDistributor.canClaim(expandDecimals(1, 18), proof)}`);
    await feeDistributor.claim(expandDecimals(1, 18), proof);
    console.log(`balance: ${await usdt.balanceOf(feeDistributor.address)}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
