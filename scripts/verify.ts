// @ts-ignore
import hre, { ethers } from 'hardhat';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';
import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';

import ERC1967Proxy from 'hardhat-deploy/extendedArtifacts/ERC1967Proxy.json';

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
    const arbitrumSepolia = new Etherscan(
        'I1PKGCI4WRSPKXZKM1CUHTXP28ZX5TXYK8',
        'https://api-sepolia.arbiscan.io/api',
        'https://sepolia.arbiscan.io/',
    );

    // const artifact = await deployments.deploy(`verify-demo`, {
    //     from: deployer.address,
    //     contract: 'Faucet',
    //     args: [[ZERO_ADDRESS], [utils.parseEther('1')]],
    // });
    // console.log(artifact.address);

    await verifyContract(lineaGoerli, '', []);

    // await verifyProxyContract(lineaGoerli, '0x934B2325c32419c64433eff92CD37933916c1a79', [
    //     '0x68d46485dd36824E1910aEA4BAB5Ba686BF9cAe7',
    //     '0xc0c53b8b000000000000000000000000d299a898f3ff37c131362fb52319a9a9ec7e5a030000000000000000000000004ec5f327c11719af6c3020cda84ffb1e2cfcb942000000000000000000000000cc3720e14650492eef8871c8f579ff23fef7b73c',
    // ]);
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

async function verifyProxyContract(instance: Etherscan, proxyAddress: string, args: any[]) {
    const { message: guid } = await instance.verify(
        proxyAddress,
        ERC1967Proxy.solcInput,
        'solc_0.8/openzeppelin/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
        'v0.8.10+commit.fc410830',
        await encodeArgs(args),
    );

    await sleep(1000);
    const verificationStatus = await instance.getVerificationStatus(guid);
    if (verificationStatus.isSuccess()) {
        const contractURL = instance.getContractUrl(proxyAddress);
        console.log(`Successfully verified contract on Etherscan: ${contractURL}`);
    }
}

async function encodeArgs(args: any[]) {
    const { Interface } = await import('@ethersproject/abi');
    const contractInterface = new Interface(ERC1967Proxy.abi);
    return contractInterface.encodeDeploy(args).replace('0x', '');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
