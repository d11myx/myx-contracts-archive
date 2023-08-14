const { deployContract, deployUpgradeableContract, toChainLinkPrice } = require('./utils/helpers');
const { expandDecimals } = require('./utils/utilities');
const hre = require('hardhat');
const { mintWETH, getConfig } = require('./utils/utils');
const { contractAt } = require('./utils/helpers');
async function main() {
    const [user0, user1, user2, user3] = await hre.ethers.getSigners();

    console.log(`signers: ${user0.address} ${user1.address} ${user2.address} ${user3.address}`);

    let btc = await contractAt('Token', await getConfig('Token-BTC'));
    let usdt = await contractAt('Token', await getConfig('Token-USDT'));
    let eth = await contractAt('Token', await getConfig('Token-ETH'));

    let btcPriceFeed = await deployContract('MockPriceFeed', ['BTC']);
    let usdtPriceFeed = await deployContract('MockPriceFeed', ['USDT']);
    let ethPriceFeed = await deployContract('MockPriceFeed', ['ETH']);

    await ethPriceFeed.setLatestAnswer(toChainLinkPrice(2000));
    await ethPriceFeed.setAdmin(user1.address, true);

    await btcPriceFeed.setLatestAnswer(toChainLinkPrice(30000));
    await btcPriceFeed.setAdmin(user1.address, true);

    await usdtPriceFeed.setLatestAnswer(toChainLinkPrice(1));
    await usdtPriceFeed.setAdmin(user1.address, true);
    let addressProvider = await deployContract('AddressesProvider', []);
    let roleManager = await deployContract('RoleManager', [addressProvider.address]);

    await addressProvider.setRolManager(roleManager.address);
    let fastPriceFeed = await deployContract('IndexPriceFeed', [
        addressProvider.address
    ]);

    let oraclePriceFeed = await deployContract('OraclePriceFeed', [addressProvider.address]);

    await roleManager.addAdmin(user0.address);
    await roleManager.addPoolAdmin(user0.address);
    await roleManager.addKeeper(user0.address);
    await roleManager.addKeeper(user1.address);

    await oraclePriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8);
    await oraclePriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8);
    await oraclePriceFeed.setTokenConfig(usdt.address, usdtPriceFeed.address, 8);

    await fastPriceFeed.connect(user0).setTokens([btc.address, eth.address], [10, 10]);

    await fastPriceFeed.setMaxTimeDeviation(300);

}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
