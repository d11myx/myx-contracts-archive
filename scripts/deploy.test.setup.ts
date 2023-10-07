import { ethers } from 'hardhat';
import { getPriceOracle, getRoleManager, getTokens, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const roleManager = await getRoleManager();
    const priceOracle = await getPriceOracle();

    const { usdt, btc, eth } = await getTokens();
    console.log(`btc oracle price:`, ethers.utils.formatUnits(await priceOracle.getOraclePrice(btc.address), 30));
    console.log(`eth oracle price:`, ethers.utils.formatUnits(await priceOracle.getOraclePrice(eth.address), 30));
    console.log(`btc index price:`, ethers.utils.formatUnits(await priceOracle.getIndexPrice(btc.address), 30));
    console.log(`eth index price:`, ethers.utils.formatUnits(await priceOracle.getIndexPrice(eth.address), 30));

    const keepers: string[] = [
        '0x00131a1ACbc91F9C0133Ecf9474407a15Be09BE4',
        '0xA96a3f13EDaB8709B4d3398BA4cb8b3EF22F2Aa8',
        '0x28a19454Fcbe375E2Eed23371F887216895448bB',
        '0x0671976b074687cD780971dc071EA6b431AEA17e',
        '0x07d6a53585ed5889B5Fe1b1bCae1D17711aAaaB1',
        '0x1B1EDa913Cb704B9f8155448d81B6B64F769b51e',
        '0x7008189eBbc6aA2F818b1E0f9247caF4E0B70569',
        '0x2aF265Be9df2427e23a34AE74bDD96f087C5240E',
        '0x2330Ee2565b06df5518e070916bcDd7914ED5E30',
        '0xF96402E65Ec23adC0B4fc9Cf023cAB2F63474def',
        // '0xA85583325A974bE1B47a492589Ce4370a6C20628',
        // '0x90A6E957421e4da018d4d42358777282d5B58f0D',
        // '0xf3ca5d7ffe335d97323A6579D9a82f94134b9d4b',
        // '0xCB46beC2C4B768299F5eB2d03042AeF70095f83e',
        // '0xc13403910d21901661C200eafa7076de0711d3Fb',
        // '0x715f29B6b150Db476cf5a8b5667C1bc2f6025fA4',
        // '0xBA0886b286374BCC8754699775c05fe86b165705',
        // '0x1C7780946c47cCEd4AC394f59b984E983b3576a3',
        // '0x9F02805250713C534EA2B76B537c714B6959b8CB',
        // '0xd4c55C8625c1D0AC0f69A790C15ad2c01dC7a50f',
        // '0xED8697599638fF3192492AAc02f8CCCd7E5F1834',
        // '0xB7ba707A62D73C5823879FdC2B1D1CDfb484B48A',
        // '0x97f00086093674dde1B4e6B1c1866aE6fDEeF19E',
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
