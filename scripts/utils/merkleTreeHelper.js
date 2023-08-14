const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");
const ethers = require("ethers");

function createMerkleTree(elements) {
  const leafNodes = elements.map(e => keccak256(e));
  return new MerkleTree(leafNodes, keccak256, {sortPairs: true});
}

function getLeaf(element) {
  return keccak256(element);
}

module.exports = {
  createMerkleTree,
  getLeaf,
  MerkleTree
}
