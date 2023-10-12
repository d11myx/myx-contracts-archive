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
        '0xA85583325A974bE1B47a492589Ce4370a6C20628',
        '0x90A6E957421e4da018d4d42358777282d5B58f0D',
        '0xf3ca5d7ffe335d97323A6579D9a82f94134b9d4b',
        '0xCB46beC2C4B768299F5eB2d03042AeF70095f83e',
        '0xc13403910d21901661C200eafa7076de0711d3Fb',
        '0x715f29B6b150Db476cf5a8b5667C1bc2f6025fA4',
        '0xBA0886b286374BCC8754699775c05fe86b165705',
        '0x1C7780946c47cCEd4AC394f59b984E983b3576a3',
        '0x9F02805250713C534EA2B76B537c714B6959b8CB',
        '0xd4c55C8625c1D0AC0f69A790C15ad2c01dC7a50f',
        '0xED8697599638fF3192492AAc02f8CCCd7E5F1834',
        '0xB7ba707A62D73C5823879FdC2B1D1CDfb484B48A',
        '0x97f00086093674dde1B4e6B1c1866aE6fDEeF19E',
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
