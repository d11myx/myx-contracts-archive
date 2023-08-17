import { ethers } from 'ethers';
import { derivePrivateKeys } from 'hardhat/internal/core/providers/util';
import { bufferToHex } from '@nomicfoundation/ethereumjs-util';

async function main() {
    let mnemonic: string = 'upgrade feel analyst sick undo picture when please vendor lizard spy strategy';
    let hdpath: string = "m/44'/60'/0'/0/0";
    let initialIndex: number = 0;
    let count: number = 30;
    let passphrase: string = '';

    const privateKeys = derivePrivateKeys(mnemonic.trim(), hdpath, initialIndex, count, passphrase);

    const { bufferToHex } = require('@nomicfoundation/ethereumjs-util');
    for (let pk of privateKeys) {
        const pkAsHex = bufferToHex(pk);

        const wallet = new ethers.Wallet(pkAsHex);
        console.log(wallet.address + '---' + wallet.privateKey);
    }
    // const privateKeysAsHex = privateKeys.map((pk) => bufferToHex(pk));
    //
    // privateKeysAsHex.for
    // console.log(privateKeysAsHex);

    // for (let i = 0; i < 31; i++) {
    //     const wallet = ethers.Wallet.createRandom();
    //     console.log(wallet.privateKey + '----' + wallet.address);
    // }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
