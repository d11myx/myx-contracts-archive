const hre = require('hardhat');

async function main() {
    for (let i = 0; i < 10; i++) {
        const wallet = hre.ethers.Wallet.createAccount();
        console.log(`Account #${i + 20}: ${wallet.address}`);
        console.log(`Private Key: ${wallet.privateKey}`);
        console.log();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
