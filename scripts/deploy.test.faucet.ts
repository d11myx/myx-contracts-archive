// @ts-ignore
import { ethers } from 'hardhat';
import { getTokens, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const { usdt, btc } = await getTokens();

    const factory = await ethers.getContractFactory('Faucet');
    const faucet = await factory.deploy([btc.address, usdt.address], [1, 100000]);
    console.log(`faucet:`, faucet.address);
    await waitForTx(await btc.mint(faucet.address, ethers.utils.parseEther('100000')));
    await waitForTx(await usdt.mint(faucet.address, ethers.utils.parseEther('10000000000')));

    console.log(await btc.balanceOf(faucet.address));
    console.log(await usdt.balanceOf(faucet.address));

    // const w = ethers.Wallet.createRandom();
    // const wallet = new ethers.Wallet(w.privateKey, deployer.provider);
    // await deployer.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther('0.2') });
    // await faucet.connect(wallet).getAsset();
    // console.log(await btc.balanceOf(wallet.address));
    // console.log(await eth.balanceOf(wallet.address));
    // console.log(await usdt.balanceOf(wallet.address));

    // const tokens: Token[] = [usdt, btc, eth];

    // const accounts: string[] = [
    //     '0x39662E75F24211dA75e0f98301c65b78930A4634',
    //     '0xf7B6029E6e89BdF9263172De7CE1E3427291dad8',
    //     '0x589129Fd1e528543Ed6F93B009e0119b7A6e0EA5',
    //     '0x127BCa15CCeb2E0C90d87B6E7B83fD79ADAd8719',
    //     '0x84380AABe33d013bfB06638D3D18bB1319A18224',
    //     '0xcA6eb3EEAc492B06eee82cD93ce8486B3a33c955',
    //     '0x3b96129fBd12b761177e4B1Ff0efbf59E583129c',
    //     '0xD5405c64de91e89797D6cDbAc242641e2AfE0b91',
    //     '0x5CD9eEB25b11685bB64fd3e80AC52c23371a2eb8',
    //     '0x2bbAe32257374CfB714b0373d2FAA90327042105',
    //     '0xDF470cd84fC23799A97a2c6bE2abe082f698864c',
    //     '0xa2feB37C9e34004b14e2323e901f9328c08C57F0',
    //     '0x980Fb12cF31f5c66cfC8d2CDf822D3f5E7cf35aE',
    //     '0xa657017b5252D33e5AE084F51a2aA9DC296b3149',
    //     '0x16330780d1a1D54aBB8f4e33c358e02225C3C1A5',
    //     '0x5f3057Db046CF93bf8328B7160b519E84F767349',
    //     '0x00D724996e6bf36aa42Ecb4EffDDCd5754Ad0f41',
    //     '0xeb1480A1dF4C51a5a7cAf004a1fFB11e07921268',
    //     '0x906bCF5a8ECB05fD05Af0fB489D87Eff5Fa95770',
    //     '0x3cee0bF86dFF2cDCFD82880eB3aCFcBc144Ad845',
    // ];
    //
    // for (let account of accounts) {
    //     await deployer.sendTransaction({ to: account, value: ethers.utils.parseEther('0.2') });
    //
    //     for (let token of tokens) {
    //         console.log(` mint for ${account} 100000000.0${await token.symbol()}`);
    //         await waitForTx(await token.mint(account, ethers.utils.parseEther('100000000')));
    //     }
    // }
}

// 0xb2d457b556858a9f090e3243cc97e733dcf434eb4f2ff0030a57efc0eb8bfea6----0x39662E75F24211dA75e0f98301c65b78930A4634
// 0xad735b2e3c0af984a285ed832f4bdd5077131f5d8c791e9dbcf29c41b682bddc----0xf7B6029E6e89BdF9263172De7CE1E3427291dad8
// 0x53cdc271a7feb7c8ae4cc49e0518da01c69ebea52a14277c824fda0eea13c56e----0x589129Fd1e528543Ed6F93B009e0119b7A6e0EA5
// 0x9c7daa227ccab96249690646f0910d60da74d6c2e5c4cf39890470cc281e9a50----0x127BCa15CCeb2E0C90d87B6E7B83fD79ADAd8719
// 0x867b6e5ee9c354b387c807cd384bea90f00a0a7a89047715ab03e705ed70d406----0x84380AABe33d013bfB06638D3D18bB1319A18224
// 0x48447062d56543bc32c37dee7ca2ff36ea8689885772a38c9370e35cf1b0a073----0xcA6eb3EEAc492B06eee82cD93ce8486B3a33c955
// 0x5a37088b1e3317054180c7d5dc61fcd2531897c157deb0f9dcc419de276f7c45----0x3b96129fBd12b761177e4B1Ff0efbf59E583129c
// 0x0fed5ad73f461d616c8bc85dafd0a68d03e655a20bfa9e8b7652dda1acd4cb2b----0xD5405c64de91e89797D6cDbAc242641e2AfE0b91
// 0x30535572ca93a6413705e7c567a688eb8017bd5894daf5e22ebafb05f926a9b1----0x5CD9eEB25b11685bB64fd3e80AC52c23371a2eb8
// 0x0d45c672f2a6b89e3c77356ae28442530e1a8b4e35e21e118e60384a59bf8165----0x2bbAe32257374CfB714b0373d2FAA90327042105
// 0x3f97a81b9d2068ae917bfeef370d64a2361b4b8e35600e13f908cd7f74eee51c----0xDF470cd84fC23799A97a2c6bE2abe082f698864c
// 0x18a9a1de35795281d1d4fec20a45096d0297ec919293d0715bfaa459abc34a8d----0xa2feB37C9e34004b14e2323e901f9328c08C57F0
// 0x0ce4c754166a4bd6459f730d1762cd5e2f3afa91d68a52b89ed7cb08b9c6bd07----0x980Fb12cF31f5c66cfC8d2CDf822D3f5E7cf35aE
// 0xb0a129373e8557382f5c971e5151d92080971e944bccf3e71e36026c29b1bc88----0xa657017b5252D33e5AE084F51a2aA9DC296b3149
// 0xa64f4607507c7fb2985fcfd14328a4341b55491a7685f3ab8fa007c0d0722fc3----0x16330780d1a1D54aBB8f4e33c358e02225C3C1A5
// 0xea318e4195b579fd163420452e9333aeed0282f48c2c9f5acb072494ceb3b746----0x5f3057Db046CF93bf8328B7160b519E84F767349
// 0xff535f7ef0bfe22d0f00b8cb1964ed39b3139f63e2a69700fad65d52cc133090----0x00D724996e6bf36aa42Ecb4EffDDCd5754Ad0f41
// 0x7964af71c420b05d340aa0c61dd9ee2e9987e6e3b106c23d18b7722bfe43b65c----0xeb1480A1dF4C51a5a7cAf004a1fFB11e07921268
// 0x6b2068b176a67a87d630d375926f40b2f66f59b85d1f981cba3d06ff29360751----0x906bCF5a8ECB05fD05Af0fB489D87Eff5Fa95770
// 0x107d100124b646494786302773c40fe0981c119072a7a9611c600b1750d8fc53----0x3cee0bF86dFF2cDCFD82880eB3aCFcBc144Ad845

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
