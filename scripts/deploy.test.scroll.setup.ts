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
    const oraclePriceFeed = (await getOraclePriceFeed()) as any as PythOraclePriceFeed;

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

        '0x5ee97D0668148a83c9Dc10EC19F7bF32dBe04A48',
        '0xaBc1f636d9E86032eC29935051b69659d7CbC194',
        '0xE3428A8a3780e509e8112313Ed3935aA064748FE',
        '0xbDb4bdD0468A6a79b463f0786E743095DeF66338',
        '0xe5e894d091c73a5BAd270cD00cc8cb98999ad5c9',
        '0xFe0519f8C2C0D78Da176de62F7a5e0606008FA0C',
        '0xB7Bd72746Ab7d45d4BCC083B050b19b965af636D',
        '0x1f4705265d99Ae486e4F7AeC7B308265D6Ee662a',
        '0x9591c4143cD444A818C954ED06C6FfdB09C38859',
        '0xd74231e58bAccbE0b9eDC9C26090acA132C90367',
        '0xA2009BBfEA577dB7d922cfbF11E64a4aDEe95C85',
        '0xE33D17B6B18283E65a30D2002dDbB42906143Abe',
        '0x112b9D42C14DE7f1f2B03739B803CF60cCC33769',
        '0x90aD70Dc987e6C889cAf7d339fEB24B6420ECBa3',
        '0x22c31fd3F46f97C86aD3785B8C51D401204CA817',
        '0x364C85346f98f6b5238f5e3152d3FA14E39ff738',
        '0x7574967C06036bdC4a59d2d35ed2Fb0843c3Ad80',
        '0xEA15df24145F298D27C58aD9b48d486Be733ff53',
        '0x1c28065aBF6f5f204b33531Aa77ad711aBcE27F0',
        '0xB380F6AbA79052A141Cd6267Ab477304C25f8B9d',
    ];

    for (let keeper of keepers) {
        await waitForTx(await roleManager.addKeeper(keeper));
        await waitForTx(await roleManager.addPoolAdmin(keeper));
    }

    const pythOraclePriceFeed = await ethers.getContractAt('PythOraclePriceFeed', oraclePriceFeed.address);
    await waitForTx(await pythOraclePriceFeed.connect(deployer).updatePriceAge(60));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
