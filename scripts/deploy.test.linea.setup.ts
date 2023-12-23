// @ts-ignore
import { ethers } from 'hardhat';
import { getIndexPriceFeed, getOraclePriceFeed, getRoleManager, getTokens, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { PythOraclePriceFeed } from '../types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    const roleManager = await getRoleManager();
    const oraclePriceFeed = await getOraclePriceFeed();

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

        '0xB5d58F2F6Db4a92f9fD6A1f4BE88593DB4847223',
        '0x4bDfd0b1C9f368B19082C5dAd948C5a8a592544d',
        '0x9AdFc363bC1e75A831e8C3e3fAd265e41A7D2B99',
        '0xD9eb4dB64350e375882991d370832Eadb7Ae217c',
        '0xda90A6258291A05a8fA1853D2C47bbdF4861072F',
        '0x1fB239a3eCc93A549b9D1953ef57C4CFbB0f0C68',
        '0xf3db453ccc1028c43793bCfd99ffeDCa5EA7eB65',
        '0x274E81310f8d05B9491577A2CA9CF68030DcF2Ca',
        '0x55D93C6a92AaC8BA3d3825e99d94997B8f3A93CE',
        '0x8B82045Cc5291cb5E3DC3ad30d8F91BC137EDd14',
        '0xBe0D0Ef2f7Fc71E2F4D1E7691e0dF56ad5832749',
        '0x9C168597c248B07444cC1CE6e59F1733F0651ba3',
        '0xaE1c1af0479d5F1aBee5d697bAcABF3502E4d832',
        '0x7Ab013BFa7bAeDCcEAACD236Bd701932D55d3AfA',
        '0xd8d316CACA7681b767676f581eF8C9E7AD115847',
        '0xf2417B2B363EEDDD9F93D40A50e65E3ec2922263',
        '0xB85ca413188427e00762d0399496428489d1c967',
        '0xE600790305513382b0c149cB4e504355E32c782C',
        '0xC708104be432aA97f8678240faE574C7be8c1DF2',
        '0x5B0BBDA220ab28CA96eBd73bcCB32D5498acF115',
    ];

    // for (let keeper of keepers) {
    //     await waitForTx(await roleManager.addKeeper(keeper));
    //     await waitForTx(await roleManager.addPoolAdmin(keeper));
    // }
    //
    // const pythOraclePriceFeed = await ethers.getContractAt('PythOraclePriceFeed', oraclePriceFeed.address);
    // await waitForTx(await pythOraclePriceFeed.connect(deployer).updatePriceAge(60));

    // const wallet = new ethers.Wallet(
    //     'a5f6cbc5851da39699e5779e9d2c61966ea50ea08988c5430785e8d2c8c71eeb',
    //     deployer.provider,
    // );

    for (const keeper of keepers) {
        // await wallet.sendTransaction({
        //     to: keeper,
        //     value: ethers.utils.parseEther('10'),
        // });
        console.log(
            `keeper: ${keeper} balance: ${ethers.utils.formatEther(await deployer.provider.getBalance(keeper))}`,
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
