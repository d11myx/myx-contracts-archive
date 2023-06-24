const hre = require("hardhat");
let fs = require('fs');
const {expandDecimals} = require("./utilities");

let localPath = __dirname + "/" + "../config/local_config.json";
let remotePath = __dirname + "/" + "../config/remote_config.json";

function repeatString(str, num) {
  if (!num) {
    num = 30;
  }
  // repeat after me
  var Array=[];
  var newArray=[str];   //将字符串放置到数组当中
  for(var i=1;i<num+1;i++)
  {
    Array=Array.concat(newArray);
  }
  return Array.join("");
}

async function getChainId() {
  const users = await hre.ethers.getSigners();
  const user = users[0];
  return await user.getChainId();
}

async function setConfig(key, val, chainId) {
  let path = await getPath();
  key = (chainId || (await getChainId()) + "-" + key)
  let json = JSON.parse(fs.readFileSync(path))
  json[key] = val;
  fs.writeFileSync(path, JSON.stringify(json, null, 2));
}

async function getConfig(key, chainId) {
  let path = await getPath();
  key = (chainId || (await getChainId()) + "-" + key)
  let json = JSON.parse(fs.readFileSync(path))
  return json[key];
}

async function getPath() {
  if (hre.network.name == 'local') {
      return localPath
  } else if (hre.network.name == 'remote') {
      return remotePath
  }
}

function addDecimal(num) {
  return BigInt(num * 1000000000000000000);
}
function getConfirmBlock() {
  return 1;
}

async function mintWETH(eth, receiver, amount) {
  const user = (await ethers.getSigners())[9];
  await network.provider.request({
    method: "hardhat_setBalance",
    params: [user.address, expandDecimals(amount + 1000, 18).toHexString().replace("0x0", "0x")],
  });

  await eth.connect(user).deposit({value: expandDecimals(amount, 18)})
  await eth.connect(user).transfer(receiver, expandDecimals(amount, 18))
}

module.exports = {
  repeatString,
  getChainId,
  setConfig,
  getConfig,
  addDecimal,
  getConfirmBlock,
  mintWETH
}
