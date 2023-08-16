import { ethers } from 'ethers';

async function main() {
    for (let i = 0; i < 31; i++) {
        const wallet = ethers.Wallet.createRandom();
        console.log(wallet.privateKey + '----' + wallet.address);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
