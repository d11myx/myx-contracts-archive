// @ts-ignore
import hre, { ethers, deployments } from 'hardhat';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';
import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import { ZERO_ADDRESS } from '../helpers';
import { utils } from 'ethers';

async function main() {
    const [deployer] = await ethers.getSigners();

    const lineaGoerli = new Etherscan(
        '6WZUFU45J91UMAHDV2C52TV8RAJAQASIZR',
        'https://api-testnet.lineascan.build/api',
        'https://goerli.lineascan.build',
    );
    const lineaMainnet = new Etherscan(
        'I7TMBCCPR75UPE2H14EIWDYS469TFAHHUW',
        'https://api.lineascan.build/api',
        'https://lineascan.build',
    );

    // const artifact = await deployments.deploy(`verify-demo`, {
    //     from: deployer.address,
    //     contract: 'Faucet',
    //     args: [[ZERO_ADDRESS], [utils.parseEther('1')]],
    // });
    // console.log(artifact.address);

    await verifyContract(lineaGoerli, '0x7f47ca4C5D30848514648936c9b87756BCEa2d64', [
        [ZERO_ADDRESS],
        [utils.parseEther('1')],
    ]);
}

async function verifyContract(instance: Etherscan, contractAddress: string, args: any[]) {
    let isVerified = await instance.isVerified(contractAddress);
    if (isVerified) {
        return;
    }

    await hre.run('verify:verify', {
        address: contractAddress,
        constructorArguments: [...args],
    });

    await sleep(1000);
    isVerified = await instance.isVerified(contractAddress);
    if (isVerified) {
        const contractURL = instance.getContractUrl(contractAddress);
        console.log(`Successfully verified contract on Etherscan: ${contractURL}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
