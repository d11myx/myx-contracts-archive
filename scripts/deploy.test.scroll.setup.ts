// @ts-ignore
import { ethers } from 'hardhat';
import { getIndexPriceFeed, getOraclePriceFeed, getRoleManager, getTokens, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const roleManager = await getRoleManager();
    const priceOracle = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();

    const { usdt, btc, eth } = await getTokens();
    console.log(`btc oracle price:`, ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30));
    console.log(`eth oracle price:`, ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30));
    console.log(`btc index price:`, ethers.utils.formatUnits(await indexPriceFeed.getPrice(btc.address), 30));
    console.log(`eth index price:`, ethers.utils.formatUnits(await indexPriceFeed.getPrice(eth.address), 30));

    const keepers: string[] = [
        '0xE98abdBdBAEBC1DC7e04CFD0a0Ae76965503E27D',
        '0x5eF8EB1f57f94ba5603920Be9b680d636AF3a96A',
        '0xC9767568faF609dd0BF9398459944435D597678c',
        '0x5a90bEd504f033CD12Bf91E33CA1e5B056477CAc',
        '0xDb014B5B304aE8037EdCB142776Fb58E517e5147',
        '0xe68Cb93D5dB5e550dd40055dF4b62e2bCc4c8c9d',
        '0x91bB296D80c077E3E5343931B213D4Bbe664482B',
        '0x9512117e428b08f12e4BeBa8D9eE00F01CCe8Cc8',
        '0xD26F7f224326057154413c38e9942EBcf8dAe154',
        '0xF25b17220ecD5c75B63322EFF2a79bf19317C579',
    ];

    for (let keeper of keepers) {
        // await deployer.sendTransaction({ to: keeper, value: ethers.utils.parseEther('100') });

        await waitForTx(await roleManager.addKeeper(keeper));
        await waitForTx(await roleManager.addPoolAdmin(keeper));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
