import { ethers } from 'hardhat';
import { waitForTx, getRoleManager, getOraclePriceFeed, getTokens } from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const priceOracle = await getOraclePriceFeed();
    const roleManager = await getRoleManager();

    const { btc, eth } = await getTokens();
    console.log(`btc price:`, ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30));
    console.log(`eth price:`, ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30));

    const keepers: string[] = [
        '0x66D1e5F498c21709dCFC916785f09Dcf2D663E63',
        '0x8C2B496E5BC13b4170dC818132bEE5413A39834C',
        '0x9a5c3C2843eB3d9b764A2F00236D8519989BbDa1',
        '0x299227e2bD681A510b00dFfaC9f4FD0Da0715B94',
        '0xF1BAB1E9ad036B53Ad653Af455C21796f15EE3bD',
        '0x8bc45c15C993A982AFc053ce0fF7B59b40eE0D7B',
    ];

    for (let keeper of keepers) {
        await deployer.sendTransaction({ to: keeper, value: ethers.utils.parseEther('100') });

        await waitForTx(await roleManager.addKeeper(keeper));
        await waitForTx(await roleManager.addPoolAdmin(keeper));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
