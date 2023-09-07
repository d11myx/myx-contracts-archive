const {deployContract, contractAt} = require("../utils/helpers");
const {expandDecimals, formatBalance, reduceDecimals, getBlockTime} = require("../utils/utilities");
const {getConfig, mintETH} = require("../utils/utils");
const hre = require("hardhat");
const {deployMockCallback, MAX_UINT_AMOUNT,
    getRouter,
    getOrderManager,
    getExecutor,
    getOraclePriceFeed,
    roleManager,
    getPool, getToken, getMockToken
} = require("../../helpers");
const {ethers} = require("hardhat");

async function main() {
    console.log("\n addLiquidity")

    const [lpUser] = await hre.ethers.getSigners()

    console.log(`lpUser: ${lpUser.address}`)

    const pool = await getPool();

    let eth = await getMockToken('ETH')
    const btc = await getMockToken("BTC")
    const usdt = await getToken();

    console.log(`pool: ${pool.address}, eth: ${eth.address}, btc: ${btc.address}, usdt: ${usdt.address}`);

    let btcAmount = expandDecimals(10000, 18);
    let usdtAmount = expandDecimals(300000000, 18);
    // mint token
    await btc.mint(lpUser.address, btcAmount)
    await usdt.mint(lpUser.address, usdtAmount)

    // add liquidity
    let testBtcCallBack = await deployMockCallback(btc.address, usdt.address);
    let testEthCallBack = await deployMockCallback(eth.address, usdt.address);
    console.log(`testBtcCallBack:`, testBtcCallBack.address);
    console.log(`testEthCallBack:`, testEthCallBack.address);

    await usdt.connect(lpUser).approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await btc.connect(lpUser).approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await eth.connect(lpUser).approve(testBtcCallBack.address, MAX_UINT_AMOUNT);
    await usdt.connect(lpUser).approve(testEthCallBack.address, MAX_UINT_AMOUNT);
    await btc.connect(lpUser).approve(testEthCallBack.address, MAX_UINT_AMOUNT);
    await eth.connect(lpUser).approve(testEthCallBack.address, MAX_UINT_AMOUNT);

    let pairIndex = 0;
    await testBtcCallBack.connect(lpUser).addLiquidity(
      pool.address,
      0,
      ethers.utils.parseEther('1000'),
      ethers.utils.parseEther('30000000'),
    );
    console.log(`btc-usdt lpFairPrice, ${reduceDecimals(await pool.lpFairPrice(pairIndex), 30)}`);
    let vault = await pool.getVault(pairIndex);
    console.log(`total eth: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log(`balance eth: ${formatBalance(await btc.balanceOf(pool.address))} balance usdt: ${formatBalance(await usdt.balanceOf(pool.address))}`);
    console.log();

    pairIndex = 1;
    await testEthCallBack.connect(lpUser).addLiquidity(
      pool.address,
      1,
      ethers.utils.parseEther('1000'),
      ethers.utils.parseEther('2000000'),
    );
    console.log(`eth-usdt lpFairPrice, ${reduceDecimals(await pool.lpFairPrice(pairIndex), 30)}`);
    vault = await pool.getVault(pairIndex);
    console.log(`total eth: ${formatBalance(vault.indexTotalAmount)} total usdt: ${formatBalance(vault.stableTotalAmount)}`);
    console.log(`balance eth: ${formatBalance(await eth.balanceOf(pool.address))} balance usdt: ${formatBalance(await usdt.balanceOf(pool.address))}`);
    console.log();
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
