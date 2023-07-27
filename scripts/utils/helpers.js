const fs = require('fs')
const path = require('path')
const parse = require('csv-parse')
const hre = require("hardhat");
const {repeatString, getConfirmBlock, setConfig} = require("./utils");

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const ARBITRUM = 42161
const AVALANCHE = 43114

// const {
//   GOERLI_URL,
//   GOERLI_API_KEY,
//   GOERLI_DEPLOY_KEY,
//
//   ZK_SYNC_TESTNET_URL,
//   ZK_SYNC_TESTNET_API_KEY,
//   ZK_SYNC_TESTNET_DEPLOY_KEY,
//
//   ZK_SYNC_URL,
//   ZK_SYNC_API_KEY,
//   ZK_SYNC_DEPLOY_KEY
// } = require("../../env.json")
//
//
// const providers = {
//   goerli: new hre.ethers.providers.JsonRpcProvider(GOERLI_URL),
//   testnet: new hre.ethers.providers.JsonRpcProvider(ZK_SYNC_TESTNET_URL),
//   mainnet: new hre.ethers.providers.JsonRpcProvider(ZK_SYNC_URL)
// }
//
// const signers = {
//   goerli: new hre.ethers.Wallet(GOERLI_DEPLOY_KEY).connect(providers.arbitrum),
//   testnet: new hre.ethers.Wallet(ZK_SYNC_TESTNET_DEPLOY_KEY).connect(providers.avax),
//   mainnet: new hre.ethers.Wallet(ZK_SYNC_DEPLOY_KEY).connect(providers.avax)
// }

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const readCsv = async (file) => {
  records = []
  const parser = fs
  .createReadStream(file)
  .pipe(parse({ columns: true, delimiter: ',' }))
  parser.on('error', function(err){
    console.error(err.message)
  })
  for await (const record of parser) {
    records.push(record)
  }
  return records
}

function getChainId(network) {
  if (network === "arbitrum") {
    return 42161
  }

  if (network === "avax") {
    return 43114
  }

  throw new Error("Unsupported network")
}

async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248")
    const signer = frame.getSigner()
    if (getChainId(network) !== await signer.getChainId()) {
      throw new Error("Incorrect frame network")
    }
    return signer
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`)
  }
}

async function sendTxn(txnPromise, label) {
  const txn = await txnPromise
  console.info(`Sending ${label}...`)
  await txn.wait(getConfirmBlock())
  console.info(`... Sent! ${txn.hash}`)
  await sleep(2000)
  return txn
}

async function callWithRetries(func, args, retriesCount = 3) {
  let i = 0
  while (true) {
    i++
    try {
      return await func(...args)
    } catch (ex) {
      if (i === retriesCount) {
        console.error("call failed %s times. throwing error", retriesCount)
        throw ex
      }
      console.error("call i=%s failed. retrying....", i)
      console.error(ex.message)
    }
  }
}

async function deployContract(name, args, label, options) {
  if (!options && typeof label === "object") {
    label = null
    options = label
  }
  // 获取当前账户信息
  const users = await hre.ethers.getSigners();
  const user = users[0];
  let userAddr = await user.getAddress();
  let userBalance = hre.ethers.utils.formatEther(await user.getBalance());
  let chainId = await user.getChainId();
  let trxCount = await user.getTransactionCount();

  console.log(` chainId: ${chainId}\n pubkey: ${userAddr}\n balance: ${userBalance}\n trxs: ${trxCount}`)
  console.log(`\n`)

  const contractFactory = await hre.ethers.getContractFactory(name, options)

  if (name === "FaucetToken") {
    name += "-" + args[1]
  } else if (name === "Token") {
    name += "-" + args[0]
  } else if (name === "MockPriceFeed") {
    name += "-" + args[0]
    args = []
  } else if (name === "WETH") {
    name = "Token-ETH"
  } else {
    if (label) { name = name + ":" + label }
  }


  // if (options) {
  //   let param = [...args, options]
  //   console.log(`deploy param: ${param}`)
  //   contract = await contractFactory.deploy(...args, options)
  // } else {
  //   let param = [...args]
  //   console.log(`deploy param: ${param}`)
  //   contract = await contractFactory.deploy(...args)
  // }
  let param = [...args]
  console.log(`deploy [${name}], param: ${param}`)
  let contract = await contractFactory.deploy(...args)
    // {
    // gasLimit: hre.network.config.gas,
    // gasPrice: hre.network.config.gasPrice,
  // }

  const argStr = args.map((i) => `"${i}"`).join(" ")
  console.info(`Deploying ${name} ${contract.address} ${argStr}`)
  await contract.deployTransaction.wait(getConfirmBlock())
  console.info("... Completed!")
  console.log(repeatString("-"))
  await setConfig(name, contract.address, null)
  return contract
}

async function deployUpgradeableContract(name, args, label, options) {
  if (!options && typeof label === "object") {
    label = null
    options = label
  }
  // 获取当前账户信息
  const users = await hre.ethers.getSigners();
  const user = users[0];
  let userAddr = await user.getAddress();
  let userBalance = hre.ethers.utils.formatEther(await user.getBalance());
  let chainId = await user.getChainId();
  let trxCount = await user.getTransactionCount();

  console.log(` chainId: ${chainId}\n pubkey: ${userAddr}\n balance: ${userBalance}\n trxs: ${trxCount}`)
  console.log(`\n`)

  const contractFactory = await hre.ethers.getContractFactory(name, options)

  if (name === "FaucetToken") {
    name += "-" + args[1]
  } else if (name === "Token") {
    name += "-" + args[0]
  } else if (name === "MockPriceFeed") {
    name += "-" + args[0]
    args = []
  } else if (name === "WETH") {
    name = "Token-ETH"
  } else {
    if (label) { name = name + ":" + label }
  }

  let param = [...args]
  console.log(`deploy [${name}], param: ${param}`)
  let contract = await hre.upgrades.deployProxy(contractFactory, param)

  const argStr = args.map((i) => `"${i}"`).join(" ")
  console.info(`Deploying upgradeable ${name} ${contract.address} ${argStr}`)
  await contract.deployed
  console.info("... Completed!")
  console.log(repeatString("-"))
  await setConfig(name, contract.address, null)
  return contract
}

async function contractAt(name, address, provider, options) {
  let contractFactory = await ethers.getContractFactory(name, options)
  if (provider) {
    contractFactory = contractFactory.connect(provider)
  }
  return await contractFactory.attach(address)
}

const tmpAddressesFilepath = path.join(__dirname, '..', '..', `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`)

function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath))
  }
  return {}
}

function writeTmpAddresses(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json)
  fs.writeFileSync(tmpAddressesFilepath, JSON.stringify(tmpAddresses))
}

// batchLists is an array of lists
async function processBatch(batchLists, batchSize, handler) {
  let currentBatch = []
  const referenceList = batchLists[0]

  for (let i = 0; i < referenceList.length; i++) {
    const item = []

    for (let j = 0; j < batchLists.length; j++) {
      const list = batchLists[j]
      item.push(list[i])
    }

    currentBatch.push(item)

    if (currentBatch.length === batchSize) {
      console.log("handling currentBatch", i, currentBatch.length, referenceList.length)
      await handler(currentBatch)
      currentBatch = []
    }
  }

  if (currentBatch.length > 0) {
    console.log("handling final batch", currentBatch.length, referenceList.length)
    await handler(currentBatch)
  }
}

async function updateTokensPerInterval(distributor, tokensPerInterval, label) {
  const prevTokensPerInterval = await distributor.tokensPerInterval()
  if (prevTokensPerInterval.eq(0)) {
    // if the tokens per interval was zero, the distributor.lastDistributionTime may not have been updated for a while
    // so the lastDistributionTime should be manually updated here
    await sendTxn(distributor.updateLastDistributionTime({ gasLimit: 1000000 }), `${label}.updateLastDistributionTime`)
  }
  await sendTxn(distributor.setTokensPerInterval(tokensPerInterval, { gasLimit: 1000000 }), `${label}.setTokensPerInterval`)
}

function toChainLinkPrice(value) {
  return parseInt(value * Math.pow(10, 8))
}

module.exports = {
  ARBITRUM,
  AVALANCHE,
  readCsv,
  getFrameSigner,
  sendTxn,
  deployContract,
  deployUpgradeableContract,
  contractAt,
  writeTmpAddresses,
  readTmpAddresses,
  callWithRetries,
  processBatch,
  updateTokensPerInterval,
  sleep,
  toChainLinkPrice
}
