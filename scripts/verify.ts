// @ts-ignore
import hre, { deployments, ethers } from 'hardhat';
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
    const arbitrumMain = new Etherscan(
        'I1PKGCI4WRSPKXZKM1CUHTXP28ZX5TXYK8',
        'https://api.arbiscan.io/api',
        'https://arbiscan.io/',
    );
    const local = new Etherscan(
        'I1PKGCI4WRSPKXZKM1CUHTXP28ZX5TXYK8',
        'http://export.myx.cash/api',
        'http://export.myx.cash',
    );

    // const artifact = await deployments.deploy(`verify-demo`, {
    //     from: deployer.address,
    //     contract: 'Faucet',
    //     args: [[ZERO_ADDRESS], [utils.parseEther('1')]],
    // });
    // console.log(artifact.address);

    await verifyContract(arbitrumSepolia, '0xAFe25466D559E1c319B88169cF68866Ec7825c32', [
        '0xa6FfF4f1a3f18f4F1965FBD37f1e4D5978527Edb',
        '0x2d2475CA033E05cFAf6de5a92615f1e1942F51bF',
        '0xDCEF8804a14bE465778b670979FbE42922f5F604',
        '0x51196EDc01610dc67d2B778f8Eb334255a5d1C36',
    ]);

    // const arts = [
    //     // 'Router',
    //     // 'Executor',
    //     // 'Pool_Implementation',
    //     // 'PositionManager_Implementation',
    //     // 'OrderManager_Implementation',
    //     'ExecutionLogic',
    //     // 'LiquidationLogic',
    // ];
    // for (let art of arts) {
    //     try {
    //         const deployment = await deployments.get(art);
    //         // console.log(deployment.address);
    //         // console.log(deployment.args);
    //         await verifyContract(arbitrumMain, deployment.address, deployment.args);
    //     } catch (e) {
    //         console.log(e);
    //     }
    // }

    // await verifyProxyContract(lineaGoerli, '0xd304065B7F596034270356644FF0A220574979eD', [
    //     '0x063967b144abf07dAb4751d2556E2E8A70B78e80',
    //     '0xc0c53b8b0000000000000000000000004fe0fe4eda23ec8930eccc2083bc5f15ea9a7e5b000000000000000000000000d6074c46938080f16e84125fb8e8f0d87dda229d000000000000000000000000bf3cce2ee68a258d0ba1a19b094e5fc1743033ed',
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
