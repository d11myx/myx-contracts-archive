import { ethers } from 'ethers';
import { derivePrivateKeys } from 'hardhat/internal/core/providers/util';
import { bufferToHex } from '@nomicfoundation/ethereumjs-util';

async function main() {
    // let mnemonic: string = 'crane simple raise squeeze myself old hurry virtual heart panel finish unfold';
    // let hdpath: string = "m/44'/60'/0'/0";
    // let initialIndex: number = 0;
    // let count: number = 20;
    // let passphrase: string = '';
    //
    // const privateKeys = derivePrivateKeys(mnemonic.trim(), hdpath, initialIndex, count, passphrase);
    //
    // const { bufferToHex } = require('@nomicfoundation/ethereumjs-util');
    // for (let pk of privateKeys) {
    //     const pkAsHex = bufferToHex(pk);
    //
    //     const wallet = new ethers.Wallet(pkAsHex);
    //     console.log(wallet.address + '---' + wallet.privateKey);
    // }
    // // const privateKeysAsHex = privateKeys.map((pk) => bufferToHex(pk));
    // //
    // // privateKeysAsHex.for
    // // console.log(privateKeysAsHex);

    for (let i = 0; i < 11; i++) {
        const wallet = ethers.Wallet.createRandom();
        console.log(wallet.privateKey + '----' + wallet.address);
    }
}
// 0xB7ba707A62D73C5823879FdC2B1D1CDfb484B48A---0xa4501553c73809a92e1dbe2249bb33610ce183b2cfa73f540eb58787a5046f8e
// 0x97f00086093674dde1B4e6B1c1866aE6fDEeF19E---0xad9195891340da29c84c53b4c2aaf34f378346836f050595a7f570dd909dc07d

// 0x9e724f29396f4f147c159d3a1917d17e18d7ccc257f50871ad3379c4d2fc8d7c----0xA85583325A974bE1B47a492589Ce4370a6C20628
// 0xe83e4833f8b38aeb5b3574eb73432c92125e8623398cab60015cc1b3236d333c----0x90A6E957421e4da018d4d42358777282d5B58f0D
// 0xba41d907dc021776f3f30e547107c6283e14c7aa96bfd934dc497ccd047fe885----0xf3ca5d7ffe335d97323A6579D9a82f94134b9d4b
// 0xf2a63c5d617b37fa712c8236df392408c0915b01e07344d6faf53bfdd7c1ecaa----0xCB46beC2C4B768299F5eB2d03042AeF70095f83e
// 0x377e07409860137ec6126762128ffb3ec02c54dcd9bd24706ab09dbd34b46fe4----0xc13403910d21901661C200eafa7076de0711d3Fb
// 0xe433be3517cbe52ddcb5b0d5985e35ea79f6ae47840fbfe38353d78f20437ba5----0x715f29B6b150Db476cf5a8b5667C1bc2f6025fA4
// 0xe67a3bdd275c06716f8ecea50875e9089fcb99ae0c1e6e8a4144495bb9339168----0xBA0886b286374BCC8754699775c05fe86b165705
// 0x018849fa44f7af3a91d5e6c8bf0a9d894ce3f9cda1e3168ce402b83e87888382----0x1C7780946c47cCEd4AC394f59b984E983b3576a3
// 0x74a37cb3f6f9d88cf33e2ce9f47bc5e2d294ab439260417d24a0936e08a43e2e----0x9F02805250713C534EA2B76B537c714B6959b8CB
// 0xd01633de1645d21ff63a10bead5691afd1727af42d49aab6eec9e4263c8a71bb----0xd4c55C8625c1D0AC0f69A790C15ad2c01dC7a50f
// 0xd4968e5788761e43ecf8bb573e10e2adc5905360b390f17e30dbf9cf5e01c1d9----0xED8697599638fF3192492AAc02f8CCCd7E5F1834
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
